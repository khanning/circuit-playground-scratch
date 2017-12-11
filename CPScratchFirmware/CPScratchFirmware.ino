#include "LUFAConfig.h"
#include <LUFA.h>
#include "GenericHID.h"
#include "ScratchCommands.h"
#include "Adafruit_CircuitPlayground.h"

#define STATE_CAP     0x0
#define STATE_DOUT    0x1
#define STATE_AOUT    0x2
#define STATE_IN      0x3

const uint16_t UPDATE_FREQ = 10000;

Adafruit_CPlay_LIS3DH lis;
Adafruit_CPlay_NeoPixel strip;

uint8_t tmpBuff[GENERIC_REPORT_SIZE];
double ax, ay, az;
double adelta = 0.1;
long nextSensorUpdate;

int16_t lightVal;
double lightAlpha = 0.1;

float fTemp;
double tempAlpha = 0.1;

uint8_t pinStates[] = {0, 0, 0, 0, 0, 0};
uint8_t pinLookup[] = {2, 3, 6, 9, 10, 12};

void setup()
{
  memset(tmpBuff, 0, sizeof(tmpBuff));

  initIO();
  initAccel();
  initNeoPixel();

  registerCallback(readInputData);
	SetupHardware(); // ask LUFA to setup the hardware

	GlobalInterruptEnable(); // enable global interrupts
}

void loop()
{
  if ((long) (micros() - nextSensorUpdate) >= 0) {
    nextSensorUpdate = micros() + UPDATE_FREQ;
    readSensors();
    PostData(tmpBuff);
    HID_Device_USBTask(&Generic_HID_Interface);
    USB_USBTask();
  }
}

void readInputData(uint8_t* data)
{
  if (data[0] == CMD_SET_LED) {
    setNeoPixel(&data[1]);
  } else if (data[0] == CMD_CLEAR_LED) {
    clearNeoPixel(&data[1]);
  } else if (data[0] == CMD_PLAY_NOTE) {
    playNote(&data[1]);
  } else if (data[0] == CMD_SET_PAD) {
    setPad(&data[1]);
  }
}

void initIO()
{
  pinMode(CPLAY_BUZZER, OUTPUT);
  pinMode(CPLAY_LEFTBUTTON, INPUT_PULLUP);
  pinMode(CPLAY_RIGHTBUTTON, INPUT_PULLUP);
  pinMode(CPLAY_SLIDESWITCHPIN, INPUT_PULLUP);
  pinMode(CPLAY_LIGHTSENSOR, INPUT);
  pinMode(CPLAY_THERMISTORPIN, INPUT);
}

void initAccel()
{
  lis = Adafruit_CPlay_LIS3DH(CPLAY_LIS3DH_CS);
  lis.begin(0x18);
  lis.setRange(LIS3DH_RANGE_2_G);
}

void initNeoPixel()
{
  strip = Adafruit_CPlay_NeoPixel();
  strip.updateType(NEO_GRB + NEO_KHZ800);
  strip.updateLength(10);
  strip.setPin(CPLAY_NEOPIXELPIN);
  strip.begin();
  strip.clear();
  strip.show();
  strip.setBrightness(30);
}

void setNeoPixel(uint8_t* input)
{
  uint8_t i;
  if (input[0] == 99) {
    for (i=0; i<10; i++) {
      strip.setPixelColor(i, input[1], input[2], input[3]);
    }
  } else {
    strip.setPixelColor(input[0]-1, input[1], input[2], input[3]);
  }
  strip.show();
}

void clearNeoPixel(uint8_t* input)
{
  if (input[0] == 99)
    strip.clear();
  else
    strip.setPixelColor(input[0]-1, 0, 0, 0);
  strip.show();
}

void playNote(uint8_t* input)
{
  uint16_t t = input[0] << 8 | input[1];
  uint16_t dur = input[2] << 8 | input[3];
  tone(CPLAY_BUZZER, t, dur);
}

void setPad(uint8_t* input)
{
  analogWrite(input[0], input[1]);
}

void readSensors()
{
  sensors_event_t event;
  
  if (digitalRead(CPLAY_LEFTBUTTON))
    tmpBuff[0] |= 1 << 0;
  else
    tmpBuff[0] &= ~(1 << 0);

  if (digitalRead(CPLAY_RIGHTBUTTON))
    tmpBuff[0] |= 1 << 1;
  else
    tmpBuff[0] &= ~(1 << 1);

  if (digitalRead(CPLAY_SLIDESWITCHPIN))
    tmpBuff[0] |= 1 << 2;
  else
    tmpBuff[0] &= ~(1 << 2);

  lightVal = analogRead(CPLAY_LIGHTSENSOR) * lightAlpha + (lightVal * (1.0 - lightAlpha));
  tmpBuff[1] = map(lightVal, 0, 1023, 0, 100);

  fTemp = CircuitPlayground.temperature() * tempAlpha + (fTemp * (1.0 - tempAlpha));
  tmpBuff[2] = ((int16_t) (fTemp * 100) >> 8) & 0xFF;
  tmpBuff[3] = (int16_t) (fTemp * 100) & 0xFF;
  
  lis.getEvent(&event);
  ax = event.acceleration.x * adelta + (ax * (1.0 - adelta));
  ay = event.acceleration.y * adelta + (ay * (1.0 - adelta));
  az = event.acceleration.z * adelta + (az * (1.0 - adelta));
  uint32_t mag = sqrt(ax*ax + ay*ay + az*az) * 1000000;
  int8_t roll = atan2(-ay, az) * 180 / PI;
  int8_t pitch = atan2(ax, sqrt(ay*ay + az*az)) * 180 / PI;
  tmpBuff[4] = roll;
  tmpBuff[5] = pitch;
  tmpBuff[6] = (mag >> 24) & 0xFF;
  tmpBuff[7] = (mag >> 16) & 0xFF;
  tmpBuff[8] = (mag >> 8)  & 0xFF;
  tmpBuff[9] = mag & 0xFF;
}

