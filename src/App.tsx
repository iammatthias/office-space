// import { VerticalTimeline } from "./components/VerticalTimeline";
import Visualization from "./components/Visualization";

function App() {
  return (
    <>
      <h1>
        <img src='/favicon.png' alt='icon' />
        office---space
      </h1>
      <p>
        A{" "}
        <a href='https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/' target='_blank' rel='noopener noreferrer'>
          Raspberry Pi Zero 2 W
        </a>{" "}
        with a{" "}
        <a href='https://www.waveshare.com/wiki/Environment_Sensor_HAT' target='_blank' rel='noopener noreferrer'>
          Waveshare Environment Sensor HAT
        </a>{" "}
        tracks the enviromental conditions of my office.
      </p>

      <p>The database updates every minute (minus the occasional hiccup), and each sensor is rendered below.</p>
      <p>When a data point is missing, it is rendered as the minimum value.</p>

      <ul>
        <li>BME280: Temperature (-40°C to 85°C), Humidity (0-100%), and Pressure (300-1100 hPa)</li>
        <li>TSL25911: Ambient Light (0-88,000 Lux)</li>
        <li>LTR390: UV Light (280-430nm wavelength)</li>
        <li>SGP40: VOC Air Quality (0-1,000 ppm)</li>
        <li>ICM20948: 9-DOF Motion (Accelerometer, Gyroscope, Magnetometer)</li>
      </ul>

      <main className='grid'>
        <Visualization column='temp' title='Temperature' />
        <Visualization column='lux' title='Lux' />
        <Visualization column='hum' title='Humidity' />
        <Visualization column='gas' title='VOC' />
        <Visualization column='uv' title='UV' />
        <Visualization column='pressure' title='Pressure' />
      </main>

      {/* <VerticalTimeline pageSize={12} /> */}

      <footer>
        <p>View the code on GitHub</p>
        <ul>
          <li>
            <a href='https://github.com/iammatthias/office-space' target='_blank' rel='noopener noreferrer'>
              Frontend
            </a>
          </li>
          <li>
            <a href='https://github.com/iammatthias/office-space-db' target='_blank' rel='noopener noreferrer'>
              Backend
            </a>
          </li>
        </ul>
      </footer>
    </>
  );
}

export default App;
