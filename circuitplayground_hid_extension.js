 /*This program is free software: you can redistribute it and/or modify
 *it under the terms of the GNU General Public License as published by
 *the Free Software Foundation, either version 3 of the License, or
 *(at your option) any later version.
 *
 *This program is distributed in the hope that it will be useful,
 *but WITHOUT ANY WARRANTY; without even the implied warranty of
 *MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *GNU General Public License for more details.
 *
 *You should have received a copy of the GNU General Public License
 *along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function(ext) {

  var BUFFER_SIZE = 10;

  var WRITE_DELAY = 10;

  var CMD_DIGITAL_WRITE = 0x83,
      CMD_ANALOG_WRITE = 0x84;

  var rawData = [];
  var inputData = null;
  var device = null;

  var temperature = 0;
  var brightness = 0;
  var buttonState = {
    'left': 0,
    'right': 0,
    'slider':0
  };

  var gestures = {
    SHAKE: {active: false, timeout: false}
  };

  var pitch = 0,
    roll = 0;

  var aMag = 0,
    aMagD = 0;

  function processInput(data) {
    var inputData = new Uint8Array(data);

    buttonState.left = (inputData[0] >> 0) & 1;
    buttonState.right = (inputData[0] >> 1) & 1;
    buttonState.slider = (inputData[0] >> 2) & 1;

    brightness = inputData[1];
    temperature = ((inputData[2] << 8) | inputData[3]) / 100;

    roll = inputData[4];
    if ((roll >> 7) & 1) roll -= 255;
    pitch = inputData[5];
    if ((pitch >> 7) & 1) pitch -= 255;

    var tmpMag = (inputData[6] << 24 | inputData[7] << 16 |
      inputData[8] << 8  | inputData[9]) / 10000000;
    aMagD = aMag - tmpMag;
    aMag = tmpMag;

    if (!gestures.SHAKE.timeout && Math.abs(aMagD) > 0.3) {
      setGesture(gestures.SHAKE, 500);
    }
  }

  function setGesture(gesture, dur) {
    gesture.active = true;
    gesture.timeout = true;
    setTimeout(function() {
      gesture.active = false;
    }, dur/2);
    setTimeout(function() {
      gesture.timeout = false;
    }, dur);
  }

  function map(val, aMin, aMax, bMin, bMax) {
    if (val > aMax) val = aMax;
    else if (val < aMin) val = aMin;
    return (((bMax - bMin) * (val - aMin)) / (aMax - aMin)) + bMin;
  }

  function getTiltAngle(dir) {
    if (dir === 'up') {
      return -pitch;
    } else if (dir === 'down') {
      return pitch;
    } else if (dir === 'left') {
      return roll;
    } else if (dir === 'right') {
      return -roll;
    }
  }

  ext.whenButtonPressed = function(btn) {
    if (btn === 'any')
      return buttonState.left | buttonState.right;
    else
      return buttonState[btn];
  };

  ext.isButtonPressed = function(btn) {
    if (btn === 'any')
      return buttonState.left | buttonState.right;
    else
      return buttonState[btn];
  };

  ext.setLED = function(l, c, callback) {
    var led = parseInt(l);
    if (l === 'all')
      led = 99;
    if (!Number.isInteger(led)) return;
    var r = (c >> 16) & 0xFF;
    var g = (c >> 8) & 0xFF;
    var b = c & 0xFF;
    var output = [0x80, led, r, g, b];
    send(output);
    setTimeout(callback, WRITE_DELAY);
  };

  ext.setLEDRGB = function(l, r, g, b, callback) {
    var led = parseInt(l);
    if (led < 1) return;
    if (led > 10) return;
    if (l === 'all')
      led = 99;
    if (!Number.isInteger(r)) return;
    if (!Number.isInteger(g)) return;
    if (!Number.isInteger(b)) return;
    var output = [0x80, led, r, g, b];
    send(output);
    setTimeout(callback, WRITE_DELAY);
  };

  ext.setLEDRandom = function(l, callback) {
    var led = parseInt(l);
    if (led < 1) return;
    if (led > 10) return;
    if (l === 'all')
      led = 99;
    var output = [0x80, led, getRandomColor(), getRandomColor(), getRandomColor()];
    send(output);
    setTimeout(callback, WRITE_DELAY);
  };

  function getRandomColor() {
    return Math.floor(Math.random() * (255 - 0));
  }

  ext.clearLED = function(l, callback) {
    var led = parseInt(l);
    if (l === 'all')
      led = 99;
    if (!Number.isInteger(led)) return;
    send([0x81, led]);
    setTimeout(callback, WRITE_DELAY);
  };

  ext.getSlider = function() {
    return buttonState.slider;
  };

  ext.getTemp = function(type) {
    if (type === 'F')
      return Math.round((temperature * 1.8 + 32) * 100) / 100;
    else
      return Math.round(temperature * 100) / 100;
  };

  ext.getBrightness = function() {
    return brightness;
  };

  ext.playNote = function(note, dur, callback) {
    var freq = 440 * Math.pow(1.05946309436, note-69);
    freq = Math.round(freq);
    if (dur < 0) return;
    if (dur > 255) dur = 255;
    dur = Math.round(dur * 1000);
    var output = [0x82, freq >> 8, freq & 0xFF, dur >> 8, dur & 0xFF];
    send(output);
    setTimeout(callback, dur-25);
  };

  function isTilted(dir) {
    if (dir === 'any')
      return (Math.abs(roll) > 15 || Math.abs(pitch) > 15);
    else
      return getTiltAngle(dir) >= 15;
  }

  ext.whenShaken = function(dir) {
    return gestures.SHAKE.active;
  };

  ext.whenTilted = function(dir) {
    return isTilted(dir);
  }

  ext.isTilted = function(dir) {
    return isTilted(dir);
  };

  ext.getTiltAngle = function(dir) {
    return getTiltAngle(dir);
  };

  ext.setClipDigital = function(pin, state, callback) {
    pin = parseInt(pin);
    if (isNaN(pin) || menus.clipDPins.indexOf(pin) < 0) {
      callback();
      return;
    }
    var output = [0x83, pin, 0];
    if (state === "on")
      output[2] = 255;
    //device.emit('write', {uuid: TX_CHAR, bytes: output});
    send(output);
    setTimeout(callback, WRITE_DELAY);
  };

  ext.setClipAnalog = function(pin, val, callback) {
    pin = parseInt(pin);
    if (isNaN(pin) || menus.clipAPins.indexOf(pin) < 0) {
      callback();
      return;
    }
    if (val > 100) val = 100;
    else if (val < 0) val = 0;
    val = Math.round(map(val, 0, 100, 0, 255));
    var output = [0x83, pin, val];
    send(output);
    setTimeout(callback, WRITE_DELAY);
  };

  ext._getStatus = function() {
    if (device) {
      return {status: 2, msg: 'Scratch Pad connected'};
    } else {
      return {status: 1, msg: 'ScratchPad disconnected'};
    }
  };

  var poller = null;
  ext._deviceConnected = function(dev) {
    if (device) return;
    dev.open(function(d) {
      device = dev;
      console.log("Device connected");
      setTimeout(function() {
        poller = setInterval(function() {
          device.read(processInput, 10);
        }, 20);
      }, 1000);
    });
  };

  ext._deviceRemoved = function(dev) {
    if (device != dev) return;
    if (poller) poller = clearInterval(poller);
    device = null;
  };

  ext._shutdown = function() {
    if (device) device.close();
    if (poller) poller = clearInterval(poller);
    device = null;
  };

  function send(bytes) {
    if (!device) return;
    bytes.unshift(0);
    device.write(new Uint8Array(bytes).buffer);
  }

  var blocks = [
    ['h', 'when %m.btnSides button pressed', 'whenButtonPressed', 'left'],
    ['b', '%m.btnSides button pressed?', 'isButtonPressed', 'left'],
    [' '],
    ['b', 'slider', 'getSlider'],
    ['r', 'temperature in %m.temp', 'getTemp', 'F'],
    ['r', 'brightness', 'getBrightness'],
    [' '],
    ['w', 'set LED %d.leds to %c', 'setLED', '1', 0xFF0000],
    ['w', 'set LED %d.leds to R:%n G:%n B:%n', 'setLEDRGB', '1', 0, 255, 0],
    ['w', 'set LED %d.leds to random', 'setLEDRandom', '1'],
    ['w', 'turn LED %d.leds off', 'clearLED', '1'],
    [' '],
    ['w', 'play note %d.note for %n second', 'playNote', 60, 1],
    [' '],
    ['h', 'when shaken', 'whenShaken'],
    ['h', 'when tilted %m.tiltDirs', 'isTilted', 'any'],
    ['b', 'tilted %m.tiltDirs ?', 'isTilted', 'any'],
    ['r', 'tilt angle %m.tiltAngleDirs', 'getTiltAngle', 'up'],
    [' '],
    ['w', 'set pad %d.clipDPins %m.states', 'setClipDigital', 6, 'on'],
    ['w', 'set pad %d.clipAPins to %n%', 'setClipAnalog', 6, '50']
  ];

  var menus = {
    btnSides: ['left', 'right', 'any'],
    leds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'all'],
    tiltDirs: ['any', 'up', 'down', 'left', 'right'],
    tiltAngleDirs: ['up', 'down', 'left', 'right'],
    temp: ['F', 'C'],
    clipAPins: [6, 9, 10],
    clipDPins: [6, 9, 10, 12],
    states: ['on', 'off']
  };

  var descriptor = {
    blocks: blocks,
    menus: menus,
    url: 'http://scratch.mit.edu'
  };

  var hid_info = {type: 'hid', vendor: 0x03eb, product: 0x204f};
  //var hid_info = {type: 'hid', vendor: 0x239a, product: 0x8011};
  ScratchExtensions.register('Circuit Playground', descriptor, ext, hid_info);
})({});
