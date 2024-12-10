#!/usr/bin/python
# -*- coding:utf-8 -*-
import sqlite3
import random
from datetime import datetime, timedelta
import math
import logging
from tqdm import tqdm  # Progress bar for clarity

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

class MockDataGenerator:
    def __init__(self, db_path='sensor_data.db', num_records=100000):
        self.db_path = db_path
        self.num_records = num_records
        self.start_time = datetime.now() - timedelta(days=365)  # Start 1 year ago

    def generate_timestamps(self):
        """Generate evenly distributed timestamps over the past year."""
        interval = timedelta(days=365) / self.num_records
        return [self.start_time + interval * i for i in range(self.num_records)]

    def generate_environmental_data(self):
        """Generate BME280 environmental sensor data."""
        return [
            (
                timestamp,
                round(1013 + random.uniform(-5, 5), 2),  # Pressure
                round(22 + math.sin(timestamp.hour * math.pi / 12) * 5 + random.uniform(-1, 1), 2),  # Temperature
                round(45 + random.uniform(-10, 10), 2)  # Humidity
            )
            for timestamp in tqdm(self.generate_timestamps(), desc="Generating BME280 data", unit="records")
        ]

    def generate_light_data(self):
        """Generate TSL2591 light sensor data."""
        return [
            (
                timestamp,
                round(random.uniform(0, 1000), 2)  # Light Intensity
            )
            for timestamp in tqdm(self.generate_timestamps(), desc="Generating TSL2591 data", unit="records")
        ]

    def generate_uv_data(self):
        """Generate LTR390 UV sensor data."""
        return [
            (
                timestamp,
                random.randint(0, 11)  # UV Index (0 to 11)
            )
            for timestamp in tqdm(self.generate_timestamps(), desc="Generating LTR390 data", unit="records")
        ]

    def generate_voc_data(self):
        """Generate SGP40 VOC sensor data."""
        return [
            (
                timestamp,
                round(random.uniform(100, 10000), 2)  # VOC Gas concentration
            )
            for timestamp in tqdm(self.generate_timestamps(), desc="Generating SGP40 data", unit="records")
        ]

    def generate_motion_data(self):
        """Generate ICM20948 motion sensor data."""
        return [
            (
                timestamp,
                round(random.uniform(-90, 90), 2),  # Roll
                round(random.uniform(-90, 90), 2),  # Pitch
                round(random.uniform(0, 360), 2),  # Yaw
                round(random.uniform(-10, 10), 2),  # Acceleration X
                round(random.uniform(-10, 10), 2),  # Acceleration Y
                round(random.uniform(-10, 10), 2),  # Acceleration Z
                round(random.uniform(-250, 250), 2),  # Gyroscope X
                round(random.uniform(-250, 250), 2),  # Gyroscope Y
                round(random.uniform(-250, 250), 2),  # Gyroscope Z
                round(random.uniform(-50, 50), 2),  # Magnetic X
                round(random.uniform(-50, 50), 2),  # Magnetic Y
                round(random.uniform(-50, 50), 2)   # Magnetic Z
            )
            for timestamp in tqdm(self.generate_timestamps(), desc="Generating Motion data", unit="records")
        ]

    def insert_mock_data(self):
        """Insert mock data for all sensors into the database."""
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        try:
            # Insert BME280 data
            logging.info("Inserting BME280 environmental data...")
            env_data = self.generate_environmental_data()
            cur.executemany('''
                INSERT INTO bme280_data (timestamp, pressure, temperature, humidity)
                VALUES (?, ?, ?, ?)
            ''', env_data)

            # Insert TSL2591 data
            logging.info("Inserting TSL2591 light sensor data...")
            light_data = self.generate_light_data()
            cur.executemany('''
                INSERT INTO tsl2591_data (timestamp, light_intensity)
                VALUES (?, ?)
            ''', light_data)

            # Insert LTR390 data
            logging.info("Inserting LTR390 UV sensor data...")
            uv_data = self.generate_uv_data()
            cur.executemany('''
                INSERT INTO ltr390_data (timestamp, uv_index)
                VALUES (?, ?)
            ''', uv_data)

            # Insert SGP40 data
            logging.info("Inserting SGP40 VOC sensor data...")
            voc_data = self.generate_voc_data()
            cur.executemany('''
                INSERT INTO sgp40_data (timestamp, voc_gas)
                VALUES (?, ?)
            ''', voc_data)

            # Insert Motion data
            logging.info("Inserting Motion sensor data...")
            motion_data = self.generate_motion_data()
            cur.executemany('''
                INSERT INTO motion_data (
                    timestamp, roll, pitch, yaw, 
                    acceleration_x, acceleration_y, acceleration_z, 
                    gyroscope_x, gyroscope_y, gyroscope_z, 
                    magnetic_x, magnetic_y, magnetic_z
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', motion_data)

            conn.commit()
            logging.info("All sensor mock data inserted successfully.")
        except sqlite3.Error as e:
            logging.error(f"Database error: {str(e)}")
        finally:
            conn.close()

def main():
    try:
        generator = MockDataGenerator()
        generator.insert_mock_data()
    except Exception as e:
        logging.error(f"Error generating mock data: {str(e)}")

if __name__ == "__main__":
    main()
