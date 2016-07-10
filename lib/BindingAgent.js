import http from 'http';
import util from 'util';
import assert from 'assert';

// binding agent will return a given options.socket as the socket for the agent
// this is useful if you already have a socket established and want the request
// to use that socket instead of making a new one
function BindingAgent(options) {
    options = options || {};
    http.Agent.call(this, options);

    this.socket = options.socket;
    assert(this.socket, 'socket is required for BindingAgent');
    this.createConnection = create_connection;
}

util.inherits(BindingAgent, http.Agent);

function create_connection(port, host, options) {
    return this.socket;
}

export default BindingAgent;
