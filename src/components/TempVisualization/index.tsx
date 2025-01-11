import { Canvas } from "@react-three/fiber";
import { useEnvironmentalData } from "../../hooks/useEnvironmentalData";
import styles from "./TempVisualization.module.css";

function Scene() {
  return (
    <mesh>
      <boxGeometry args={[2, 1, 0.1]} />
      <meshStandardMaterial color='pink' />
    </mesh>
  );
}

export function TempVisualization() {
  const { data, loading, error } = useEnvironmentalData("temp");

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  // Only log once after data is loaded
  if (data.length > 0) {
    console.log("Temperature Data:", data);
  }

  return (
    <div className={styles.container}>
      <Canvas camera={{ position: [0, 0, 5] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <Scene />
      </Canvas>
    </div>
  );
}
