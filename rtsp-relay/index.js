// @ts-check
// const { path: ffmpegPath } = require('@ffmpeg-installer/ffmpeg');
const { spawn } = require('child_process');
const ews = require('express-ws');
const ps = require('ps-node');
const atob = require('atob');

class InboundStreamWrapper {
  start({ name, url, additionalFlags }) {
    if (this.verbose) console.log('[rtsp-relay] Creating brand new stream');
    console.log('url : ' + url)
    // console.log(ffmpegPath)
    this.stream[name] = spawn(
      'ffmpeg',
      [
        '-i',
        url,
        '-f',
        'mpegts',
        '-codec:v',
        'mpeg1video',
        '-r',
        '30', // 30 fps. any lower and the client can't decode it
        ...additionalFlags,
        '-',
      ],
      { detached: false },
    );
    this.stream[name].stderr.on('data', () => { });
    this.stream[name].stderr.on('error', (e) => console.log('err:error', e));
    this.stream[name].stdout.on('error', (e) => console.log('out:error', e));
    this.stream[name].on('exit', (code, signal) => {
      if (signal !== 'SIGTERM') {
        if (this.verbose) {
          console.warn(
            '[rtsp-relay] Stream died - will recreate when the next client connects',
          );
        }
        this.stream[name] = null;
      }
    });
  }

  get(options) {
    this.verbose = options.verbose;
    if (!this.stream) {
      this.stream = [];
      this.start(options);
    } else {
      if (!this.stream[options.name]) this.start(options);
    }

    return this.stream[options.name];
  }

  kill(name, clientsLeft) {
    if (!this.stream[name]) return; // the stream is currently dead
    if (!clientsLeft) {
      if (this.verbose)
        console.log('[rtsp-relay] no clients left; destroying stream');
      this.stream[name].kill('SIGTERM');
      this.stream[name] = null;
      // next time it is requested it will be recreated
    }
    if (this.verbose)
      console.log(
        '[rtsp-relay] there are still some clients so not destroying stream',
      );
  }
}

let wsInstance;
module.exports = (app) => {
  if (!wsInstance) wsInstance = ews(app);
  const wsServer = wsInstance.getWss();

  // even if there are multiple feeds being consumed
  // by this app, only allow one open at a time
  const Inbound = new InboundStreamWrapper();

  return {
    killAll() {
      ps.lookup({ command: 'ffmpeg' }, (err, list) => {
        if (err) throw err;
        list
          .filter((p) => p.arguments.includes('mpeg1video'))
          .forEach(({ pid }) => ps.kill(pid));
      });
    },
    proxy({ additionalFlags = [], verbose }) {
      return function handler(ws, req) {
        let url = atob(req.query.url);
        let name = req.query.cam;
        if (!url) throw new Error('URL to rtsp stream is required');

        // these should be detected from the source stream
        const [width, height] = [0, 0];

        const streamHeader = Buffer.alloc(8);
        streamHeader.write('jsmp');
        streamHeader.writeUInt16BE(width, 4);
        streamHeader.writeUInt16BE(height, 6);
        ws.send(streamHeader, { binary: true });

        if (verbose) console.log('[rtsp-relay] New WebSocket Connection');
        const streamIn = Inbound.get({ name, url, additionalFlags, verbose });
        ws.on('close', () => {
          const c = wsServer.clients.size;
          if (verbose)
            console.log(`[rtsp-relay] WebSocket Disconnected ${c} left`);
          Inbound.kill(name, c);
        });

        streamIn.stdout.on('data', (data, opts) => {
          if (ws.readyState === 1) ws.send(data, opts);
        });
      };
    },
  };
};
