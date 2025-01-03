import { VerticalTimeline } from "./components/VerticalTimeline";

function App() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <h1>Sensor Data Dashboard</h1>
      <div>
        <VerticalTimeline pageSize={100} initialDays={1} />
      </div>
    </div>
  );
}

export default App;
