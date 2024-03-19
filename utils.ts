import { humanId } from "human-id";

export const uid = () => {
  return humanId({ capitalize: false, separator: "-" });
};

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const parseResponse = (buffer: Buffer) => {
  const asString = Buffer.from(buffer).toString();
  const [responseHeaders, body] = asString.split("\r\n\r\n");

  const headers = new Headers();

  responseHeaders
    .trim()
    .split("\r\n")
    .forEach((header) => {
      const [name, value] = header.split(": ");
      if (!name.includes("HTTP")) headers.append(name, value);
    });

  return { body, headers };
};
