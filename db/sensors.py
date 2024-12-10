#!/usr/bin/python
# -*- coding:utf-8 -*-
import time
import sqlite3
import logging
from datetime import datetime
import ICM20948
import MPU925x
import BME280
import LTR390
import TSL2591
import SGP40
import smbus
from contextlib import contextmanager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('sensor_collector.log'),
        logging.StreamHandler()
    ]
)

# Database configuration
DB_PATH = 'sensor_data.db'

@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()

class SensorDataCollector:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
        # Initialize I2C bus
        self.bus = smbus.SMBus(1)
        
        # Initialize sensors
        try:
            self.bme280 = BME280.BME280()
            self.bme280.get_calib_param()
            self.light = TSL2591.TSL2591()
            self.uv = LTR390.LTR390()
            self.sgp = SGP40.SGP40()
            
            # Detect and initialize motion sensor
            ICM_SLAVE_ADDRESS = 0x68
            device_id1 = self.bus.read_byte_data(ICM_SLAVE_ADDRESS, 0x00)  # ICM_ADD_WIA
            device_id2 = self.bus.read_byte_data(ICM_SLAVE_ADDRESS, 0x75)  # MPU_ADD_WIA
            
            if device_id1 == 0xEA:  # ICM_VAL_WIA
                self.mpu = ICM20948.ICM20948()
                self.logger.info("Initialized ICM20948 sensor")
            elif device_id2 == 0x71:  # MPU_VAL_WIA
                self.mpu = MPU925x.MPU925x()
                self.logger.info("Initialized MPU925x sensor")
            else:
                raise Exception("No compatible motion sensor found")
                
            self.logger.info("All sensors initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Error initializing sensors: {str(e)}")
            raise

    def read_environmental(self):
        """Read BME280 environmental data"""
        try:
            bme = self.bme280.readData()
            return {
                'pressure': round(bme[0], 2),
                'temperature': round(bme[1], 2),
                'humidity': round(bme[2], 2)
            }
        except Exception as e:
            self.logger.error(f"Error reading BME280: {str(e)}")
            return None

    def read_light(self):
        """Read TSL2591 light data"""
        try:
            return round(self.light.Lux(), 2)
        except Exception as e:
            self.logger.error(f"Error reading TSL2591: {str(e)}")
            return None

    def read_uv(self):
        """Read LTR390 UV data"""
        try:
            return self.uv.UVS()
        except Exception as e:
            self.logger.error(f"Error reading LTR390: {str(e)}")
            return None

    def read_voc(self):
        """Read SGP40 VOC data"""
        try:
            return round(self.sgp.raw(), 2)
        except Exception as e:
            self.logger.error(f"Error reading SGP40: {str(e)}")
            return None

    def read_motion(self):
        """Read motion sensor data"""
        try:
            icm = self.mpu.getdata()
            return {
                'roll': round(icm[0], 2),
                'pitch': round(icm[1], 2),
                'yaw': round(icm[2], 2),
                'acc_x': icm[3],
                'acc_y': icm[4],
                'acc_z': icm[5],
                'gyro_x': icm[6],
                'gyro_y': icm[7],
                'gyro_z': icm[8],
                'mag_x': icm[9],
                'mag_y': icm[10],
                'mag_z': icm[11]
            }
        except Exception as e:
            self.logger.error(f"Error reading motion sensor: {str(e)}")
            return None

    def save_data(self, env_data, light_data, uv_data, voc_data, motion_data):
        """Save all sensor data to database"""
        with get_db_connection() as conn:
            cur = conn.cursor()
            timestamp = datetime.now()
            
            try:
                # Save environmental data
                if env_data:
                    cur.execute('''
                        INSERT INTO bme280_data (timestamp, pressure, temperature, humidity)
                        VALUES (?, ?, ?, ?)
                    ''', (timestamp, env_data['pressure'], env_data['temperature'], env_data['humidity']))

                # Save light data
                if light_data is not None:
                    cur.execute('''
                        INSERT INTO tsl2591_data (timestamp, light_intensity)
                        VALUES (?, ?)
                    ''', (timestamp, light_data))

                # Save UV data
                if uv_data is not None:
                    cur.execute('''
                        INSERT INTO ltr390_data (timestamp, uv_index)
                        VALUES (?, ?)
                    ''', (timestamp, uv_data))

                # Save VOC data
                if voc_data is not None:
                    cur.execute('''
                        INSERT INTO sgp40_data (timestamp, voc_gas)
                        VALUES (?, ?)
                    ''', (timestamp, voc_data))

                # Save motion data
                if motion_data:
                    cur.execute('''
                        INSERT INTO motion_data (
                            timestamp, roll, pitch, yaw,
                            acceleration_x, acceleration_y, acceleration_z,
                            gyroscope_x, gyroscope_y, gyroscope_z,
                            magnetic_x, magnetic_y, magnetic_z
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        timestamp, motion_data['roll'], motion_data['pitch'], motion_data['yaw'],
                        motion_data['acc_x'], motion_data['acc_y'], motion_data['acc_z'],
                        motion_data['gyro_x'], motion_data['gyro_y'], motion_data['gyro_z'],
                        motion_data['mag_x'], motion_data['mag_y'], motion_data['mag_z']
                    ))

                conn.commit()
                self.logger.info(f"Data saved successfully at {timestamp}")
                
            except sqlite3.Error as e:
                self.logger.error(f"Database error: {str(e)}")
                conn.rollback()
            except Exception as e:
                self.logger.error(f"Unexpected error while saving data: {str(e)}")
                conn.rollback()

    def collect_data(self):
        """Collect data from all sensors"""
        env_data = self.read_environmental()
        light_data = self.read_light()
        uv_data = self.read_uv()
        voc_data = self.read_voc()
        motion_data = self.read_motion()
        
        self.save_data(env_data, light_data, uv_data, voc_data, motion_data)

def main():
    collector = None
    try:
        collector = SensorDataCollector()
        logging.info("Starting sensor data collection...")
        
        while True:
            try:
                collector.collect_data()
                time.sleep(60)  # Wait for 60 seconds before next collection
            except Exception as e:
                logging.error(f"Error in collection cycle: {str(e)}")
                time.sleep(5)  # Wait a short time before retrying
                
    except KeyboardInterrupt:
        logging.info("Data collection stopped by user")
    except Exception as e:
        logging.error(f"Fatal error: {str(e)}")
    finally:
        logging.info("Shutting down sensor data collection")

if __name__ == "__main__":
    main()