import { useState } from "react";
import Visualization from "./components/Visualization";
// import { VerticalTimeline } from "./components/VerticalTimeline";

function App() {
  const [isSensorsExpanded, setIsSensorsExpanded] = useState(false);

  // const [currentPage, setCurrentPage] = useState<"home" | "timeline">("home");

  // useEffect(() => {
  //   // Handle hash-based routing
  //   const handleHashChange = () => {
  //     const hash = window.location.hash.slice(1);
  //     if (hash === "timeline") {
  //       setCurrentPage("timeline");
  //     } else {
  //       setCurrentPage("home");
  //     }
  //   };

  //   // Set initial page based on hash
  //   handleHashChange();

  //   // Listen for hash changes
  //   window.addEventListener("hashchange", handleHashChange);
  //   return () => window.removeEventListener("hashchange", handleHashChange);
  // }, []);

  // const navigateTo = (page: "home" | "timeline") => {
  //   setCurrentPage(page);
  //   if (page === "timeline") {
  //     window.location.hash = "timeline";
  //   } else {
  //     window.location.hash = "";
  //   }
  // };

  // if (currentPage === "timeline") {
  //   return (
  //     <>
  //       <header>
  //         <div className='header-content'>
  //           <h1>
  //             <img src='/favicon.png' alt='icon' />
  //             office---space
  //           </h1>
  //           <button onClick={() => navigateTo("home")} className='nav-button'>
  //             ← Home
  //           </button>
  //         </div>
  //       </header>

  //       <section className='timeline'>
  //         <VerticalTimeline />
  //       </section>

  //       <footer>
  //         <p>View the code on GitHub</p>
  //         <ul>
  //           <li>
  //             <a href='https://github.com/iammatthias/office-space' target='_blank' rel='noopener noreferrer'>
  //               Frontend
  //             </a>
  //           </li>
  //           <li>
  //             <a href='https://github.com/iammatthias/office-space-db' target='_blank' rel='noopener noreferrer'>
  //               Backend
  //             </a>
  //           </li>
  //         </ul>
  //       </footer>
  //     </>
  //   );
  // }

  return (
    <>
      <header>
        <div className='header-content'>
          <h1>
            <img src='/favicon.png' alt='icon' />
            office---space
          </h1>
          {/* <button onClick={() => navigateTo("timeline")} className='nav-button'>
            Timeline →
          </button> */}
        </div>
      </header>

      <section className='intro'>
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
          Data updates every minute. Missing data points are rendered as the nearest values. Images are generated
          locally and pinned on{" "}
          <a href='https://pinata.cloud/' target='_blank' rel='noopener noreferrer'>
            Pinata
          </a>
          .
        </p>
      </section>

      <section className='sensors'>
        <h2>Sensors</h2>
        <button
          className='sensors-toggle'
          onClick={() => setIsSensorsExpanded(!isSensorsExpanded)}
          aria-expanded={isSensorsExpanded}
          aria-controls='sensors-content'
        >
          {isSensorsExpanded ? "Hide" : "Show"} sensors
          <span className='toggle-icon' aria-hidden='true'>
            {isSensorsExpanded ? "−" : "+"}
          </span>
        </button>
        <div
          id='sensors-content'
          className={`sensor-grid ${isSensorsExpanded ? "expanded" : "collapsed"}`}
          aria-hidden={!isSensorsExpanded}
        >
          <div className='sensor-item'>
            <span className='sensor-name'>BME280</span>
            <span className='sensor-desc'>Temperature, Humidity, Pressure</span>
          </div>
          <div className='sensor-item'>
            <span className='sensor-name'>TSL25911</span>
            <span className='sensor-desc'>Ambient Light (0-88,000 Lux)</span>
          </div>
          <div className='sensor-item'>
            <span className='sensor-name'>LTR390</span>
            <span className='sensor-desc'>UV Light (280-430nm)</span>
          </div>
          <div className='sensor-item'>
            <span className='sensor-name'>SGP40</span>
            <span className='sensor-desc'>VOC Air Quality (0-1,000 ppm)</span>
          </div>
          <div className='sensor-item'>
            <span className='sensor-name'>ICM20948</span>
            <span className='sensor-desc'>9-DOF Motion Sensor</span>
          </div>
        </div>
      </section>

      <section className='visualizations'>
        {/* <h2>Current Readings</h2> */}
        <main className='grid'>
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

export default App;
