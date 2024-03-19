import http from "http";
import Debug from "debug";
import pump from "pump";
import EventEmitter from "events";
import { TunnelAgent } from "./agent";

// A client encapsulates req/res handling using an agent
// If an agent is destroyed, the request handling will error
// The caller is responsible for handling a failed request
export default class Client extends EventEmitter {
  public agent: TunnelAgent;
  public id: string;
  public debug: any;
  public graceTimeout: any;

  constructor(options: { id: string; agent: TunnelAgent }) {
    super();

    const agent = (this.agent = options.agent);
    const id = (this.id = options.id);

    this.debug = Debug(`lt:Client[${this.id}]`);

    // client is given a grace period in which they can connect before they are _removed_
    this.graceTimeout = setTimeout(() => {
      console.log(`Timed out. Closing client.`);
      this.close();
    }, 1000).unref();

    agent.on("online", () => {
      this.debug("client online %s", id);
      clearTimeout(this.graceTimeout);
    });

    agent.on("offline", () => {
      this.debug("client offline %s", id);

      // if there was a previous timeout set, we don't want to double trigger
      clearTimeout(this.graceTimeout);

      // client is given a grace period in which they can re-connect before they are _removed_
      this.graceTimeout = setTimeout(() => {
        console.log(`Timed out #2. Closing client.`);
        this.close();
      }, 1000).unref();
    });

    // TODO(roman): an agent error removes the client, the user needs to re-connect?
    // how does a user realize they need to re-connect vs some random client being assigned same port?
    agent.once("error", (err) => {
      console.error(err);
      this.close();
    });
  }

  stats() {
    return this.agent.stats();
  }

  close() {
    clearTimeout(this.graceTimeout);
    this.agent.destroy();
    this.emit("close");
  }

  handleRequest(req, res) {
    console.log(`\n\n\n\x1b[33m==>HANDLE REQ \x1b[0m\n`);
    this.debug("> %s", req.url);
    const opt = {
      path: req.url,
      agent: this.agent,
      method: req.method,
      headers: req.headers,
    };

    const clientReq = http.request(opt, (clientRes) => {
      this.debug("< %s", req.url);
      // write response code and headers
      res.writeHead(clientRes.statusCode, clientRes.headers);

      // using pump is deliberate - see the pump docs for why
      pump(clientRes, res);
    });

    // this can happen when underlying agent produces an error
    // in our case we 504 gateway error this if we have already sent headers
    clientReq.once("error", (err) => {
      console.log(`\n\n\n\x1b[33m==>CLIENT REQ ERR \x1b[0m\n`);
      console.log(err);

      // TODO: if headers not sent - respond with gateway unavailable
    });

    // using pump is deliberate - see the pump docs for why
    pump(req, clientReq);
  }

  handleUpgrade(req, socket) {
    this.debug("> [up] %s", req.url);
    socket.once("error", (err) => {
      // These client side errors can happen if the client dies while we are reading
      // We don't need to surface these in our logs.
      if (err.code == "ECONNRESET" || err.code == "ETIMEDOUT") {
        return;
      }
      console.error(err);
    });

    this.agent.createConnection({}, (err, conn) => {
      this.debug("< [up] %s", req.url);
      // any errors getting a connection mean we cannot service this request
      if (err) {
        socket.end();
        return;
      }

      // socket met have disconnected while we waiting for a socket
      if (!socket.readable || !socket.writable) {
        console.log(`\n\n\n\x1b[33m==>NOT READABLE OR WRITABLE \x1b[0m\n`);
        conn.destroy();
        socket.end();
        return;
      }

      // websocket requests are special in that we simply re-create the header info
      // then directly pipe the socket data
      // avoids having to rebuild the request and handle upgrades via the http client
      const arr = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length - 1; i += 2) {
        arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }

      arr.push("");
      arr.push("");

      // using pump is deliberate - see the pump docs for why
      pump(conn, socket);
      pump(socket, conn);
      conn.write(arr.join("\r\n"));
    });
  }
}
