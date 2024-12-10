#!/usr/bin/python
# -*- coding:utf-8 -*-
import sqlite3
import logging
from datetime import datetime, timedelta
from tqdm import tqdm  # For progress bar

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

DB_PATH = "sensor_data.db"
BATCH_DAYS = 7  # Process summaries 7 days at a time to minimize memory usage

SENSOR_CONFIGS = [
    {
        "name": "bme280",
        "data_table": "bme280_data",
        "summary_table": "bme280_daily_summary",
        "all_time_summary": "bme280_all_time_summary",
        "fields": ["temperature", "humidity", "pressure"],
    },
    {
        "name": "tsl2591",
        "data_table": "tsl2591_data",
        "summary_table": "tsl2591_daily_summary",
        "all_time_summary": "tsl2591_all_time_summary",
        "fields": ["light_intensity"],
    },
    {
        "name": "ltr390",
        "data_table": "ltr390_data",
        "summary_table": "ltr390_daily_summary",
        "all_time_summary": "ltr390_all_time_summary",
        "fields": ["uv_index"],
    },
    {
        "name": "sgp40",
        "data_table": "sgp40_data",
        "summary_table": "sgp40_daily_summary",
        "all_time_summary": "sgp40_all_time_summary",
        "fields": ["voc_gas"],
    },
    {
        "name": "motion",
        "data_table": "motion_data",
        "summary_table": "motion_daily_summary",
        "all_time_summary": "motion_all_time_summary",
        "fields": [
            "roll", "pitch", "yaw",
            "acceleration_x", "acceleration_y", "acceleration_z",
            "gyroscope_x", "gyroscope_y", "gyroscope_z",
            "magnetic_x", "magnetic_y", "magnetic_z"
        ],
    },
]


class SummaryTableManager:
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path

    def connect_db(self):
        """Establish a connection to the SQLite database."""
        return sqlite3.connect(self.db_path)

    def recompute_summaries(self):
        """Recompute summaries for all sensor tables."""
        logging.info("Starting recomputation of summaries for all sensors.")

        conn = self.connect_db()
        cur = conn.cursor()

        try:
            for sensor in SENSOR_CONFIGS:
                logging.info(f"Processing daily summaries for {sensor['name']}...")
                self.clear_summary_table(cur, sensor["summary_table"])

                # Fetch date range
                cur.execute(
                    f"SELECT MIN(DATE(timestamp)), MAX(DATE(timestamp)) FROM {sensor['data_table']};"
                )
                start_date, end_date = cur.fetchone()
                if not start_date or not end_date:
                    logging.warning(f"No data found for {sensor['name']}. Skipping...")
                    continue

                current_date = datetime.strptime(start_date, "%Y-%m-%d")
                end_date = datetime.strptime(end_date, "%Y-%m-%d")

                total_batches = (end_date - current_date).days // BATCH_DAYS + 1
                with tqdm(
                    total=total_batches,
                    desc=f"Processing {sensor['name']} summaries",
                    unit="batch",
                ) as pbar:
                    while current_date <= end_date:
                        batch_start = current_date.strftime("%Y-%m-%d")
                        batch_end = (current_date + timedelta(days=BATCH_DAYS - 1)).strftime(
                            "%Y-%m-%d"
                        )

                        self.process_batch(cur, sensor, batch_start, batch_end)
                        conn.commit()
                        current_date += timedelta(days=BATCH_DAYS)
                        pbar.update(1)

                logging.info(f"Processing all-time summary for {sensor['name']}...")
                self.compute_all_time_summary(cur, sensor)
                conn.commit()

            logging.info("All sensor summaries recomputed successfully.")
        except sqlite3.Error as e:
            logging.error(f"Database error: {e}")
            conn.rollback()
        finally:
            conn.close()

    def clear_summary_table(self, cursor, summary_table):
        """Clear existing data in the summary table."""
        logging.info(f"Clearing data in {summary_table}...")
        cursor.execute(f"DELETE FROM {summary_table};")

    def process_batch(self, cursor, sensor, start_date, end_date):
        """
        Process a batch of data for a specific sensor.
        Computes averages and medians for the specified fields.
        """
        fields = sensor["fields"]
        summary_table = sensor["summary_table"]
        data_table = sensor["data_table"]

        # Prepare field-specific SQL for median calculation
        median_calculations = []
        for field in fields:
            median_calculations.append(f"""
                ROUND(AVG(CASE 
                    WHEN row_num_{field} = (total_rows + 1) / 2 OR row_num_{field} = total_rows / 2 + 1 
                    THEN {field} 
                END), 2) AS median_{field}
            """)

        query = f'''
            WITH Ordered AS (
                SELECT 
                    DATE(timestamp) AS date,
                    {', '.join(fields)},
                    {', '.join([f"ROW_NUMBER() OVER (PARTITION BY DATE(timestamp) ORDER BY {field}) AS row_num_{field}" for field in fields])},
                    COUNT(*) OVER (PARTITION BY DATE(timestamp)) AS total_rows
                FROM {data_table}
                WHERE DATE(timestamp) BETWEEN ? AND ?
            )
            SELECT 
                date,
                {', '.join([f"ROUND(AVG({field}), 2) AS avg_{field}" for field in fields])},
                {', '.join(median_calculations)}
            FROM Ordered
            GROUP BY date;
        '''

        cursor.execute(query, (start_date, end_date))
        results = cursor.fetchall()

        # Insert batch results into the summary table
        placeholders = ", ".join(["?"] * (1 + len(fields) * 2))
        insert_query = f'''
            INSERT OR REPLACE INTO {summary_table} (
                date, {', '.join([f"avg_{field}" for field in fields])}, {', '.join([f"median_{field}" for field in fields])}
            ) VALUES ({placeholders});
        '''
        for row in results:
            cursor.execute(insert_query, row)

    def compute_all_time_summary(self, cursor, sensor):
        """
        Compute all-time averages and medians for a specific sensor.
        """
        fields = sensor["fields"]
        all_time_summary_table = sensor["all_time_summary"]
        data_table = sensor["data_table"]

        median_calculations = [
            f"""
            ROUND(AVG(CASE 
                WHEN row_num_{field} = (total_rows + 1) / 2 OR row_num_{field} = total_rows / 2 + 1 
                THEN {field}
            END), 2) AS median_{field}
            """
            for field in fields
        ]

        query = f'''
            WITH Ordered AS (
                SELECT 
                    {', '.join(fields)},
                    {', '.join([f"ROW_NUMBER() OVER (ORDER BY {field}) AS row_num_{field}" for field in fields])},
                    COUNT(*) OVER () AS total_rows
                FROM {data_table}
            )
            SELECT 
                {', '.join([f"ROUND(AVG({field}), 2) AS avg_{field}" for field in fields])},
                {', '.join(median_calculations)}
            FROM Ordered;
        '''

        cursor.execute(query)
        result = cursor.fetchone()

        if result:
            placeholders = ", ".join(["?"] * (len(fields) * 2))
            insert_query = f'''
                INSERT OR REPLACE INTO {all_time_summary_table} (
                    id, {', '.join([f"avg_{field}" for field in fields])}, {', '.join([f"median_{field}" for field in fields])}
                ) VALUES (1, {placeholders});
            '''
            cursor.execute(insert_query, result)


def main():
    manager = SummaryTableManager()

    print("\nSummary Table Manager")
    print("1. Recompute Summaries")
    print("2. List Summaries")
    print("3. Exit")

    while True:
        choice = input("Enter your choice: ")

        if choice == "1":
            manager.recompute_summaries()
        elif choice == "2":
            table = input("Enter table name (e.g., bme280_daily_summary): ")
            manager.list_summaries(table)
        elif choice == "3":
            print("Exiting Summary Table Manager.")
            break
        else:
            print("Invalid choice. Please try again.")


if __name__ == "__main__":
    main()
