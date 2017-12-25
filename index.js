var EventEmitter = require('events').EventEmitter
var SerialPort = require('serialport')
var buffy = require('buffy')

var Mindwave = module.exports = function () {
    EventEmitter.call(this)
}

// TODO: __proto__ is depracated
Mindwave.prototype.__proto__ = EventEmitter.prototype

Mindwave.prototype.connect = function (port, baud) {
    if (!baud) {
        baud = 57600
    }
    var self = this
    if (baud !== 9600 && baud !== 57600) {
        return this.emit('error', 'Invalid baud. Set to 9600 or 57600')
    }
    self.baud = baud
    self.port = port

    // TODO: switch baud code if 57600 for higher res data
    // http://developer.neurosky.com/docs/doku.php?id=thinkgear_communications_protocol#thinkgear_command_bytes
    if (self.serialPort != undefined) {
        self.serialPort.pause();
        self.serialPort.close();
    }
    SerialPort.list()
    .then((ports) => {
        for (var i = 0; i < ports.length; i++) {
            let port = ports[i];
            let sp = new SerialPort(port.comName, {
                baudRate: self.baud,
                autoOpen: false
            })
            sp.open(function (err) {
                if (err) {
                    console.log(err);
                    return;
                }
                console.log(port.comName);
                  
                self.port = port.comName;
                self.serialPort = sp;
                self.emit('connect')
                self.serialPort.on('data', function (data) {
                    self.emit(self.parse(data))
                })
                self.serialPort.on('error', function(err) {
                    console.log('Error: ', err.message);
                })
                self.serialPort.on('close', function(err) {
                    console.log('disconnected');
                    self.emit('disconnect')
                })
            })
        }
    })
    .catch((err) => {

    });
    self.emit('disconnect')
    return;
}

Mindwave.prototype.disconnect = function () {
    var self = this
    self.serialPort.pause()
    self.serialPort.flush(function () {
        self.serialPort.close(function () {
            self.emit('disconnect')
        })
    })
}

Mindwave.prototype.parse = function (data) {
    var reader = buffy.createReader(data)
    while (reader.bytesAhead() > 2) {
        if (reader.uint8() === BT_SYNC && reader.uint8() === BT_SYNC) {
            var len = reader.uint8()
            if (len >= 170)
                continue
            
            var payload = reader.buffer(len)
            var sum = 0;
            for (var i = 0; i < len; i++) {
                sum += payload[i];
            }
            var checksum = reader.uint8();
            sum = sum & 0xFF;
            sum = ~sum & 0xFF;
            if (checksum == sum) {
                this.parsePacket(payload, len);
            }
        }
    }
}

// TODO: add more
// http://developer.neurosky.com/docs/doku.php?id=thinkgear_communications_protocol#data_payload_structure

Mindwave.prototype.parsePacket = function (data, length) {
    var reader = buffy.createReader(data)
    var bytesParsed = 0;
    while (bytesParsed < length) {
        var excodeLevel = 0;
        var codeLength = 0;
        var code = reader.uint8();
        bytesParsed++;
        while (code == CODE_EX) {
            this.emit('extended');
            code = reader.uint8();
            excodeLevel++;
            bytesParsed++;
        }
        if (code >= 0x80) {
            codeLength = reader.uint8();
            bytesParsed++;
        }
        else {
            codeLength = 1;
        }
        switch(code) {
            case CODE_RAW_WAVE:
                this.emit('raw', reader.int16BE());
                break;
            case CODE_SIGNAL_QUALITY:
                this.emit('signal', reader.uint8());
                break;
            case CODE_ASIC_EEG:
                this.emit('eeg', this.parseEEG(reader.buffer(24)))
                break;
            case CODE_ATTENTION:
                this.emit('attention', reader.uint8());
                break;
            case CODE_MEDITATION:
                this.emit('meditation', reader.uint8());
                break;
            case CODE_BLINK:
                this.emit('blink', reader.uint8())
                break;
        }
        bytesParsed += codeLength;
    }
}

Mindwave.prototype.parseEEG = function (data) {
    return {
        'delta': this.parse3ByteInteger(data.slice(0, 2)),
        'theta': this.parse3ByteInteger(data.slice(3, 5)),
        'lowAlpha': this.parse3ByteInteger(data.slice(6, 8)),
        'highAlpha': this.parse3ByteInteger(data.slice(9, 11)),
        'lowBeta': this.parse3ByteInteger(data.slice(12, 14)),
        'highBeta': this.parse3ByteInteger(data.slice(15, 17)),
        'lowGamma': this.parse3ByteInteger(data.slice(18, 20)),
        'midGamma': this.parse3ByteInteger(data.slice(21, 24))
    }
}

Mindwave.prototype.parse3ByteInteger = function (data) {
    return (data[0] << 16) |
        (((1 << 16) - 1) & (data[1] << 8)) |
        ((1 << 8) - 1) &
        data[2]
}

var BT_SYNC = 0xAA
var CODE_EX = 0x55 // Extended code
var CODE_BATTERY = 0x01; // battery level
var CODE_SIGNAL_QUALITY = 0x02 // POOR_SIGNAL quality 0-255
var CODE_HEART = 0x03 // HEART_RATE 0-255
var CODE_ATTENTION = 0x04 // ATTENTION eSense 0-100
var CODE_MEDITATION = 0x05 // MEDITATION eSense 0-100
var CODE_RAW_WAVE_8BIT = 0x06; // 8BIT_RAW Wave Value (0-255)
var CODE_RAW_MARKER = 0x07; // RAW_MARKER Section Start (0)
var CODE_BLINK = 0x16 // BLINK strength 0-255
var CODE_RAW_WAVE = 0x80 // RAW wave value: 2-byte big-endian 2s-complement
var CODE_EEG_POWER = 0x81; // EEG_POWER: eight big-endian 4-byte 
var CODE_ASIC_EEG = 0x83 // ASIC EEG POWER 8 3-byte big-endian integers


//mindwave packets
var CODE_HEADSET_CONNECTED = 0xD0;
var CODE_HEADSET_NOT_FOUND = 0xD1;
var CODE_HEADSET_DISCONNECTED = 0xD2;
var CODE_HEADSET_REQUEST_DENIED = 0xD3;
var CODE_HEADSET_STANDBY_MODE = 0xD4;