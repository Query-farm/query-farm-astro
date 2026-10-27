LOAD icu;
SET TimeZone = 'UTC';
CREATE TABLE measurement_rows(
    id INTEGER PRIMARY KEY, location VARCHAR, time TIMESTAMPTZ,
    start_at TIMESTAMPTZ, end_at TIMESTAMPTZ, seconds DOUBLE, amount DOUBLE,
    mean_value DOUBLE, instant DOUBLE, event_at TIMESTAMPTZ,
    unknown_value DOUBLE, probability DOUBLE, offset_seconds INTEGER
);
INSERT INTO measurement_rows VALUES
(1,'A','2024-01-02 00:00+00','2024-01-01 23:00+00','2024-01-02 00:00+00',3600,5,10,99,'2024-01-02 00:00+00',7,20,0),
(2,'A','2024-01-02 01:00+00','2024-01-02 00:00+00','2024-01-02 01:00+00',3600,3,20,98,'2024-01-02 01:00+00',8,50,0),
(3,'A','2024-01-02 03:00+00','2024-01-02 01:00+00','2024-01-02 03:00+00',7200,4,50,97,'2024-01-02 03:00+00',9,70,0),
(4,'B','2024-01-02 00:00+00','2024-01-01 23:00+00','2024-01-02 00:00+00',3600,11,30,96,'2024-01-02 00:00+00',6,10,0);
ATTACH 'models/utc.crossfield.json' AS weather_model (TYPE crossfield);
