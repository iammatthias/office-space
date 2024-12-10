#!/usr/bin/python
# -*- coding:utf-8 -*-
import sqlite3
import os

def setup_sensor_database():
    """
    Creates an SQLite database optimized for frequent sensor data I/O operations.
    Sets up tables for each sensor type with appropriate indexes, constraints, 
    and summary tables for precomputed all-time and daily averages and medians.
    """
    db_path = 'sensor_data.db'
    conn = sqlite3.connect(db_path)

    # Enable performance optimizations
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    conn.execute('PRAGMA cache_size=-2000')  # Use 2MB of cache

    try:
        # Drop any existing triggers to ensure a clean setup
        conn.executescript('''
            DROP TRIGGER IF EXISTS trg_bme280_daily_summary;
            DROP TRIGGER IF EXISTS trg_tsl2591_daily_summary;
            DROP TRIGGER IF EXISTS trg_ltr390_daily_summary;
            DROP TRIGGER IF EXISTS trg_sgp40_daily_summary;
            DROP TRIGGER IF EXISTS trg_motion_daily_summary;
        ''')
        conn.commit()

        # Create tables for each sensor with corresponding summary tables
        conn.executescript('''
            -- Environmental Sensor (BME280)
            CREATE TABLE IF NOT EXISTS bme280_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                pressure REAL NOT NULL,
                temperature REAL NOT NULL,
                humidity REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bme280_daily_summary (
                date TEXT PRIMARY KEY,
                avg_temperature REAL,
                median_temperature REAL,
                avg_humidity REAL,
                median_humidity REAL,
                avg_pressure REAL,
                median_pressure REAL
            );
            CREATE TABLE IF NOT EXISTS bme280_all_time_summary (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                avg_temperature REAL,
                median_temperature REAL,
                avg_humidity REAL,
                median_humidity REAL,
                avg_pressure REAL,
                median_pressure REAL
            );

            -- Light Sensor (TSL2591)
            CREATE TABLE IF NOT EXISTS tsl2591_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                light_intensity REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tsl2591_daily_summary (
                date TEXT PRIMARY KEY,
                avg_light_intensity REAL,
                median_light_intensity REAL
            );
            CREATE TABLE IF NOT EXISTS tsl2591_all_time_summary (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                avg_light_intensity REAL,
                median_light_intensity REAL
            );

            -- UV Sensor (LTR390)
            CREATE TABLE IF NOT EXISTS ltr390_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                uv_index INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ltr390_daily_summary (
                date TEXT PRIMARY KEY,
                avg_uv_index REAL,
                median_uv_index REAL
            );
            CREATE TABLE IF NOT EXISTS ltr390_all_time_summary (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                avg_uv_index REAL,
                median_uv_index REAL
            );

            -- VOC Sensor (SGP40)
            CREATE TABLE IF NOT EXISTS sgp40_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                voc_gas REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sgp40_daily_summary (
                date TEXT PRIMARY KEY,
                avg_voc_gas REAL,
                median_voc_gas REAL
            );
            CREATE TABLE IF NOT EXISTS sgp40_all_time_summary (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                avg_voc_gas REAL,
                median_voc_gas REAL
            );

            -- Motion Sensor (ICM20948/MPU925x)
            CREATE TABLE IF NOT EXISTS motion_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                roll REAL NOT NULL,
                pitch REAL NOT NULL,
                yaw REAL NOT NULL,
                acceleration_x REAL NOT NULL,
                acceleration_y REAL NOT NULL,
                acceleration_z REAL NOT NULL,
                gyroscope_x REAL NOT NULL,
                gyroscope_y REAL NOT NULL,
                gyroscope_z REAL NOT NULL,
                magnetic_x REAL NOT NULL,
                magnetic_y REAL NOT NULL,
                magnetic_z REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS motion_daily_summary (
                date TEXT PRIMARY KEY,
                avg_roll REAL, median_roll REAL,
                avg_pitch REAL, median_pitch REAL,
                avg_yaw REAL, median_yaw REAL,
                avg_acceleration_x REAL, median_acceleration_x REAL,
                avg_acceleration_y REAL, median_acceleration_y REAL,
                avg_acceleration_z REAL, median_acceleration_z REAL,
                avg_gyroscope_x REAL, median_gyroscope_x REAL,
                avg_gyroscope_y REAL, median_gyroscope_y REAL,
                avg_gyroscope_z REAL, median_gyroscope_z REAL,
                avg_magnetic_x REAL, median_magnetic_x REAL,
                avg_magnetic_y REAL, median_magnetic_y REAL,
                avg_magnetic_z REAL, median_magnetic_z REAL
            );
            CREATE TABLE IF NOT EXISTS motion_all_time_summary (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                avg_roll REAL, median_roll REAL,
                avg_pitch REAL, median_pitch REAL,
                avg_yaw REAL, median_yaw REAL,
                avg_acceleration_x REAL, median_acceleration_x REAL,
                avg_acceleration_y REAL, median_acceleration_y REAL,
                avg_acceleration_z REAL, median_acceleration_z REAL,
                avg_gyroscope_x REAL, median_gyroscope_x REAL,
                avg_gyroscope_y REAL, median_gyroscope_y REAL,
                avg_gyroscope_z REAL, median_gyroscope_z REAL,
                avg_magnetic_x REAL, median_magnetic_x REAL,
                avg_magnetic_y REAL, median_magnetic_y REAL,
                avg_magnetic_z REAL, median_magnetic_z REAL
            );

            -- Sensor Metadata Table
            CREATE TABLE IF NOT EXISTS sensors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_name TEXT NOT NULL UNIQUE,
                model TEXT NOT NULL,
                i2c_address TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ''')
        conn.commit()

        print(f"Database created successfully at {os.path.abspath(db_path)}")
        print("Database is configured with:")
        print("- WAL journaling mode for improved write performance")
        print("- Optimized synchronous setting for better I/O")
        print("- Summary tables for all sensors, including acceleration, gyroscope, and magnetic data.")

    except sqlite3.Error as e:
        print(f"An error occurred: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    setup_sensor_database()
