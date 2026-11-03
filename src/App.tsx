import { useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import Visualization from "./components/Visualization";
import { VerticalTimeline } from "./components/VerticalTimeline";

function HomePage() {
  const [isSensorsExpanded, setIsSensorsExpanded] = useState(false);

  return (
    <>
      <header>
        <div>
          <h1>
            <img src='/favicon.png' alt='icon' />
            office---space
          </h1>
          <nav>
            <Link to='/timeline'>Timeline →</Link>
          </nav>
        </div>
      </header>

      <section>
        <p>
          A{" "}
          <a
            href='https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/'
            target='_blank'
            rel='noopener noreferrer'
          >
            Raspberry Pi Zero 2 W
          </a>{" "}
          with a{" "}
          <a href='https://www.waveshare.com/wiki/Environment_Sensor_HAT' target='_blank' rel='noopener noreferrer'>
            Waveshare Environment Sensor HAT
          </a>{" "}
          tracks the environmental conditions of my office.
        </p>

        <p>
          An archive of 2025, recorded every minute. Missing data points are rendered as the nearest values. Images
          are generated locally and served from Cloudflare R2.
        </p>
      </section>

      <section>
        <h2>Sensors</h2>
        <button onClick={() => setIsSensorsExpanded(!isSensorsExpanded)} aria-expanded={isSensorsExpanded}>
          {isSensorsExpanded ? "Hide" : "Show"} sensors
          <span aria-hidden='true'>{isSensorsExpanded ? "−" : "+"}</span>
        </button>
        <div aria-hidden={!isSensorsExpanded}>
          <div>
            <span>BME280</span>
            <span>Temperature, Humidity, Pressure</span>
          </div>
          <div>
            <span>TSL25911</span>
            <span>Ambient Light (0-88,000 Lux)</span>
          </div>
          <div>
            <span>LTR390</span>
            <span>UV Light (280-430nm)</span>
          </div>
          <div>
            <span>SGP40</span>
            <span>VOC Air Quality (0-1,000 ppm)</span>
          </div>
          <div>
            <span>ICM20948</span>
            <span>9-DOF Motion Sensor</span>
          </div>
        </div>
      </section>

      <section>
        <main>
          <Visualization sensor='temperature' />
          <Visualization sensor='light' />
          <Visualization sensor='humidity' />
          <Visualization sensor='gas' />
          <Visualization sensor='uv' />
          <Visualization sensor='pressure' />
        </main>
      </section>

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

function TimelinePage() {
  return (
    <>
      <header>
        <div>
          <h1>
            <img src='/favicon.png' alt='icon' />
            office---space
          </h1>
          <nav>
            <Link to='/'>← Home</Link>
          </nav>
        </div>
      </header>

      <section>
        <VerticalTimeline />
      </section>

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

function App() {
  return (
    <Routes>
      <Route path='/' element={<HomePage />} />
      <Route path='/timeline' element={<TimelinePage />} />
    </Routes>
  );
}

export default App;
