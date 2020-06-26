const express = require('express');
const app = express();

const { proxy } = require('./rtsp-relay')(app);

const handler = proxy({
    additionalFlags: ['-max_muxing_queue_size', '9999'],
    // if your RTSP stream need credentials, include them in the URL as above
    verbose: true,
});

// the endpoint our RTSP uses
app.ws('/stream', handler);

// this is an example html page to view the stream
app.get('/', (req, res) => {
    res.send(`
    <canvas id='canvas'></canvas>
    
    <script src='https://cdn.jsdelivr.net/gh/phoboslab/jsmpeg@9cf21d3/jsmpeg.min.js'></script>
    <script>
        let rtspSource = 'rtsp://username:password@hostname:port/mode=real&idc=1&ids=2'
        let url = btoa(rtspSource);
        let cam = 'cam1'; // camera name
        new JSMpeg.Player('ws://' + location.host + '/stream/?cam='+ cam +'&url=' + url, {
        canvas: document.getElementById('canvas')
        })
    </script>
    `);
});

app.listen(2000);