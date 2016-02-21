/*jslint node:true,vars:true, unparam:true */
/*jshint unused:true */

var OTP538U_AREF = 5.0;
var g_GUVAS12D_AREF = 5.0;
var g_SAMPLES_PER_QUERY = 1024;


var mraa = require("mraa");
var digitalAccelerometer = require('jsupm_mma7660');
var tempIRSensor_lib = require('jsupm_otp538u');
var UVSensor = require('jsupm_guvas12d');
var groveSensor = require('jsupm_grove');

function initUv() {
  return (new UVSensor.GUVAS12D(2));
}

function initTemp() {
  var temp = new tempIRSensor_lib.OTP538U(0, 1, OTP538U_AREF);
  
  return temp;
}

function initMotion() {
  var motion = new mraa.Gpio(5);
  motion.dir(mraa.DIR_IN);
  
  return motion;
}

function initButton() {
  var button = new mraa.Gpio(2);
  button.dir(mraa.DIR_IN);

  return button;
}

function initAccelerometer() {
  // Instantiate an MMA7660 on I2C bus 0
  var myDigitalAccelerometer = new digitalAccelerometer.MMA7660(digitalAccelerometer.MMA7660_I2C_BUS, digitalAccelerometer.MMA7660_DEFAULT_I2C_ADDR);

  // place device in standby mode so we can write registers
  myDigitalAccelerometer.setModeStandby();

  // enable 64 samples per second
  myDigitalAccelerometer.setSampleRate(digitalAccelerometer.MMA7660.AUTOSLEEP_64);

  // place device into active mode
  myDigitalAccelerometer.setModeActive();

  return myDigitalAccelerometer;
}

var myDigitalAccelerometer = initAccelerometer();
var button = initButton();
var buzzer = initBuzzer();
var motion = initMotion();
var temp   = initTemp();
//var uv     = initUv();
var light    = new groveSensor.GroveLight(2);

var gyro     = new mraa.Aio(3);

var referenceValue = 280;
var IR_ENABLED = true;
var IR_THREAT_DISABLE_TIME = 10000;

var myInterval;

var threatWindow = (new Date()).getTime() - (60*1000);
var beep = false;

var PROXIMITY_ALERT_SECONDS = 3;
var VELOCITY_TO_DISABLE = 100.0;
var IMPACT_THRESHHOLD = 1;

function initBuzzer() {
  var buzzer = new mraa.Gpio(6);
  buzzer.dir(mraa.DIR_OUT);

  return buzzer;
}

function startSensorWatch(socket) {
  'use strict';
  var touch_sensor_value = 0, last_t_sensor_value;

  buzzer.write(0);

  var ax, ay, az;
  ax = digitalAccelerometer.new_floatp();
  ay = digitalAccelerometer.new_floatp();
  az = digitalAccelerometer.new_floatp();

  var ax0, ay0, az0;
  ax0 = 0;
  ay0 = 0;
  az0 = 0;

  var ax1, ay1, az1;
  ax1 = 0;
  ay1 = 0;
  az1 = 0;

  var enabled = false;

  myInterval = setInterval(function () {
    last_t_sensor_value = touch_sensor_value;
    
    touch_sensor_value = button.read();
    
    if (touch_sensor_value === 1 && last_t_sensor_value === 0) {
      enabled = !enabled;
    }

    if(enabled) {
      var m = motion.read();
      
      if(m && threatWindow < ((new Date()).getTime() - PROXIMITY_ALERT_SECONDS*1000)) {
         if(beep) {
           buzzer.write(1); 
         } else {
           buzzer.write(0); 
         } 
      }
      
      console.log("motion: " + m);
      
      var gyro_reading = gyro.read();
      
      var angularVelocity =((gyro_reading - referenceValue)*4930)/1023.0/0.67;
      
      console.log("Angular velocity: " + angularVelocity + " max " + VELOCITY_TO_DISABLE);
      
      if(Math.abs(angularVelocity) > VELOCITY_TO_DISABLE) {
        console.log("thread disabled for 5 seconds");
        threatWindow = (new Date()).getTime(); 
      }
      
      ax0 = ax1;
      ay0 = ay1;
      az0 = az1;

      myDigitalAccelerometer.getAcceleration(ax, ay, az);

      ax1 = roundNum(digitalAccelerometer.floatp_value(ax), 6);
      ay1 = roundNum(digitalAccelerometer.floatp_value(ay), 6);
      az1 = roundNum(digitalAccelerometer.floatp_value(az), 6);

      var dx = ax0-ax1;
      var dy = ay0-ay1;
      var dz = az0-az1;

      var change_in_acceleration = Math.sqrt(dx*dx + dy*dy + dz*dz);
  
      //console.log("acceleration: " + change_in_acceleration);

      var impacted = change_in_acceleration > IMPACT_THRESHHOLD;
      
      if(impacted) {
        socket.emit('message', 'present');
        buzzer.write(1);
      } else {
        buzzer.write(0);
      }
    }
    
    beep = !beep;
  }, 50);
}

//Create Socket.io server
var http = require('http');
var app = http.createServer(function (req, res) {
    'use strict';
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('<h1>Hello world from Intel IoT platform!</h1>');
}).listen(1337);
var io = require('socket.io')(app);

console.log("Sample Reading Touch Sensor");

//Attach a 'connection' event handler to the server
io.on('connection', function (socket) {
  'use strict';
  console.log('a user connected');
  //Emits an event along with a message
  socket.emit('connected', 'Welcome');

  //Start watching Sensors connected to Galileo board
  startSensorWatch(socket);

  //Attach a 'disconnect' event handler to the socket
  socket.on('disconnect', function () {
    console.log('user disconnected');
  });
});

// round off output to match C example, which has 6 decimal places
function roundNum(num, decimalPlaces)
{
	var extraNum = (1 / (Math.pow(10, decimalPlaces) * 1000));
	return (Math.round((num + extraNum)
		* (Math.pow(10, decimalPlaces))) / Math.pow(10, decimalPlaces));
}

// When exiting: clear interval and print message
process.on('SIGINT', function()
{
  clearInterval(myInterval);

  // clean up memory
  digitalAccelerometer.delete_intp(x);
  digitalAccelerometer.delete_intp(y);
  digitalAccelerometer.delete_intp(z);

  digitalAccelerometer.delete_floatp(ax);
  digitalAccelerometer.delete_floatp(ay);
  digitalAccelerometer.delete_floatp(az);

  myDigitalAccelerometer.setModeStandby();

  console.log("Exiting...");
  process.exit(0);
});

//startSensorWatch(null);