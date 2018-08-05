import {homedir} from "os";
import * as url from "url";
import {IncomingMessage, ServerResponse} from "http";
import {Socket} from "net";
import * as WebSocket from "ws";

const program = require("commander");
const pack = require("../package.json");
const http = require("http");

program
	.version(pack.version, '-v, --version')
	.option("--listen <on>", "Specify the interface and port to listen on", "127.0.0.1:80")
	.parse(process.argv);

const listen = <string>program.listen;
let hostname = listen.substring(0, listen.lastIndexOf(":"));
let port = listen.substring(listen.lastIndexOf(":") + 1);
console.log("hostname: " + hostname);
console.log("port: " + port);

const server = http.createServer((request: IncomingMessage, response: ServerResponse) => {
	let body: string = "";
	request.on("data", data => body += data);
	request.on("end", () => {
		const withoutLeadingSlash = (<string>request.url).substring(1);
		const keyboard = withoutLeadingSlash.substring(0, withoutLeadingSlash.indexOf("/"));
		const signal = withoutLeadingSlash.substring(withoutLeadingSlash.indexOf("/") + 1);
		let signalValue: number | "nosignal";
		try {
			signalValue = Number.parseInt(body);
		} catch (e) {
			if (body === "nosignal") {
				signalValue = "nosignal";
			} else {
				response.end("Unknown signal value.");
				return;
			}
		}
		let client = clients[keyboard];
		if (client !== undefined) {
			client.send(JSON.stringify({
				signal: signal,
				value: signalValue
			}));
			response.end();
		} else {
			response.end("Keyboard not found.");
		}
	});
});
server.listen(port, hostname);
server.on("listening", () => console.log("Server listening on: " + program.listen));

const wss = new WebSocket.Server({noServer: true});
server.on("upgrade", (request: IncomingMessage, socket: Socket, head: Buffer) => {
	const pathname = url.parse(<string>request.url).pathname;
	
	if (pathname === "/listen") {
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit("connection", ws, request);
		});
	} else {
		socket.destroy();
	}
});
let clients: { [uuid: string]: WebSocket } = {};
wss.on("connection", (ws: WebSocket) => {
	console.log("New listen connection.");
	ws.on("message", message => {
		if (typeof message === "string") {
			clients[message] = ws;
		}
	});
});

let cleanedUp = false;

function cleanupProgram() {
	if (cleanedUp) {
		return;
	}
	console.log("Cleaning up...");
	server.close();
	wss.close();
	cleanedUp = true;
	console.log("Cleanup complete.");
}

/*
Note that we catch several kill signals. If we only listened to "exit", the event would never happen because the
engine doesn't exit until the HTTP server shuts down. As such, we need to hook to various other kill signals to
shut everything down first.
 */

// ctrl+c
process.on("SIGINT", () => {
	console.log("SIGINT");
	cleanupProgram();
});

// terminate
process.on("SIGTERM", () => {
	console.log("SIGTERM");
	cleanupProgram();
});

// parent process (probably npm) dies
process.on("SIGHUP", () => {
	console.log("SIGHUP");
	cleanupProgram();
});

process.on("exit", () => {
	cleanupProgram();
	console.log("Goodbye.");
});

type Command = ListenCommand;
type ListenCommand = {
	type: "listen",
	uuid: string
};

/**
 * Asserts that the input value type is of type `never`. This is useful for exhaustiveness checking: https://www.typescriptlang.org/docs/handbook/advanced-types.html#exhaustiveness-checking
 * @param {never} x
 * @returns {never}
 */
export function assertNever(x: never): never {
	throw new Error("Unexpected object: " + x);
}