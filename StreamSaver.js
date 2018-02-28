;((name, definition) => {
	'undefined' != typeof module ? module.exports = definition() :
	'function' == typeof define && 'object' == typeof define.amd ? define(definition) :
	this[name] = definition()
})('streamSaver', () => {
	'use strict'

	let
	iframe, loaded,
	secure = location.protocol == 'https:' || location.hostname == 'localhost',
	streamSaver = {
		createWriteStream,
		supported: false,
		started: false,
		closed: false,
		writes: 0,
		length: 0,
		version: {
			full: '1.0.1',
			major: 1, minor: 0, dot: 1
		}
	}

	streamSaver.mitm = 'https://bonnevoyager.github.io/StreamSaver.js/mitm.html?version=' +
		streamSaver.version.full

	try {
		// Some browser has it but ain't allowed to construct a stream yet
		streamSaver.supported = 'serviceWorker' in navigator && !!new ReadableStream() && !!new WritableStream()
	} catch(err) {
		// if you are running chrome < 52 then you can enable it
		// `chrome://flags/#enable-experimental-web-platform-features`
	}

	function createWriteStream(filename, queuingStrategy, size) {

		// normalize arguments
		if (Number.isFinite(queuingStrategy))
			[size, queuingStrategy] = [queuingStrategy, size]

		let channel = new MessageChannel,
		popup,
		setupChannel = () => new Promise((resolve, reject) => {
			channel.port1.onmessage = evt => {
				if(evt.data.download) {
					resolve()
					if(!secure) popup.close() // don't need the popup any longer
					let link = document.createElement('a')
					let click = new MouseEvent('click')

					link.href = evt.data.download
					link.dispatchEvent(click)
				}
			}

			if(secure && !iframe) {
				iframe = document.createElement('iframe')
				iframe.src = streamSaver.mitm
				iframe.hidden = true
				document.body.appendChild(iframe)
			}

			if(secure && !loaded) {
				let fn;
				iframe.addEventListener('load', fn = evt => {
					loaded = true
					iframe.removeEventListener('load', fn)
					iframe.contentWindow.postMessage(
						{filename, size}, '*', [channel.port2])
				})
			}

			if(secure && loaded) {
				iframe.contentWindow.postMessage({filename, size}, '*', [channel.port2])
			}

			if(!secure) {
				popup = window.open(streamSaver.mitm, Math.random())
				let onready = evt => {
					if(evt.source === popup){
						popup.postMessage({filename, size}, '*', [channel.port2])
						removeEventListener('message', onready)
					}
				}

				// Another problem that cross origin don't allow is scripting
				// so popup.onload() don't work but postMessage still dose
				// work cross origin
				addEventListener('message', onready)
			}
		})

		streamSaver.writes = 0
		streamSaver.length = 0

		return new WritableStream({
			start(error) {
				streamSaver.started = true

				// is called immediately, and should perform any actions
				// necessary to acquire access to the underlying sink.
				// If this process is asynchronous, it can return a promise
				// to signal success or failure.
				return setupChannel()
			},
			write(chunk) {
				streamSaver.writes++
				streamSaver.length += chunk.length

				// is called when a new chunk of data is ready to be written
				// to the underlying sink. It can return a promise to signal
				// success or failure of the write operation. The stream
				// implementation guarantees that this method will be called
				// only after previous writes have succeeded, and never after
				// close or abort is called.

				// TODO: Kind of important that service worker respond back when
				// it has been written. Otherwise we can't handle backpressure
				channel.port1.postMessage(chunk)
			},
			close() {
				streamSaver.closed = true
				streamSaver.started = false
				streamSaver.writes = 0
				streamSaver.length = 0

				channel.port1.postMessage('end')
				console.log('All data successfully read!')
			},
			abort(e) {
				streamSaver.closed = false
				streamSaver.started = false
				streamSaver.writes = 0
				streamSaver.length = 0
				
				channel.port1.postMessage('abort')
			}
		}, queuingStrategy)
	}

	return streamSaver
})
