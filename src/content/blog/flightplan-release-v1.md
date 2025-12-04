---
title: 'Flightplan v1.0: Unified Data Ecosystem Orchestration'
description: 'Introducing Flightplan v1.0, our flagship data orchestration platform that unifies your entire data ecosystem with intelligent workflow management.'
pubDate: 2024-02-15
author: 'Query.Farm Team'
tags: ['flightplan', 'release', 'orchestration', 'data-engineering']
---

# Introducing Flightplan v1.0

Today we're excited to announce the general availability of **Flightplan v1.0**, Query.Farm's unified data orchestration platform. After months of development and testing with early adopters, Flightplan is ready to transform how teams manage their data pipelines.

## What is Flightplan?

Flightplan is a modern data orchestration platform designed for the DuckDB era. It coordinates data pipelines, transformations, and analytics workflows across your entire infrastructure with:

- **Visual Workflow Designer** - Build pipelines with drag-and-drop ease
- **Intelligent Orchestration** - Automatic dependency resolution and execution
- **Real-time Monitoring** - See what's happening across your data ecosystem
- **Cloud-Native Architecture** - Deploy anywhere (AWS, GCP, Azure, on-prem)
- **DuckDB-First** - Optimized for DuckDB but works with any data tool

## Key Features

### 1. Visual Pipeline Builder

No more YAML or complex configuration files. Design pipelines visually:

```
[S3 Data] → [DuckDB Transform] → [Validation] → [Data Warehouse]
     ↓              ↓                  ↓              ↓
  Schema      Performance         Quality        Analytics
  Check       Metrics             Checks         Dashboard
```

Drag, drop, configure, deploy. It's that simple.

### 2. Automatic Dependency Management

Flightplan analyzes your workflows and automatically:
- Determines execution order
- Parallelizes independent tasks
- Handles failures gracefully
- Retries with exponential backoff

No manual DAG configuration required.

### 3. Real-Time Observability

Know exactly what's happening:

- **Pipeline Status** - See running, completed, and failed tasks at a glance
- **Performance Metrics** - Track execution time, resource usage, and throughput
- **Data Lineage** - Understand data flow from source to destination
- **Cost Tracking** - Monitor cloud resource costs per pipeline

### 4. DuckDB Integration

Flightplan is built for DuckDB:

```sql
-- Reference DuckDB extensions directly
TASK transform_data {
  ENGINE = duckdb
  EXTENSIONS = ['json_transform', 'time_series']
  QUERY = '''
    SELECT
      json_extract(data, '$.user.id') as user_id,
      time_bucket(timestamp, '1 hour') as hour,
      count(*) as events
    FROM raw_events
    GROUP BY user_id, hour
  '''
}
```

Use any of Query.Farm's 20+ extensions seamlessly.

### 5. Multi-Tool Support

While optimized for DuckDB, Flightplan works with your existing stack:

- **dbt** - Run dbt models as pipeline tasks
- **Airflow** - Import existing DAGs
- **Python** - Execute custom scripts
- **APIs** - Call REST endpoints
- **Notebooks** - Run Jupyter/Observable notebooks

## Real-World Use Cases

### Data Warehouse Modernization

A fintech company used Flightplan to migrate from Redshift to DuckDB:

```
Before: $15K/month Redshift + maintenance overhead
After:  $2K/month DuckDB + Flightplan
Result: 87% cost reduction, 3x faster queries
```

### Real-Time Analytics Pipeline

An e-commerce platform processes 10M events/day:

```
Kafka → Flightplan → DuckDB → Real-time Dashboard
     ↓
  S3 Archive (Parquet)
     ↓
  Historical Analytics
```

Latency: <30 seconds from event to dashboard.

### ML Feature Engineering

A logistics company generates ML features from sensor data:

```
IoT Sensors → Time Series Processing → Feature Store → ML Models
                     ↓
             Data Quality Checks
                     ↓
              Anomaly Detection
```

Automated retraining when data drift detected.

## Getting Started

### 1. Installation

```bash
# Install Flightplan CLI
pip install flightplan-cli

# Initialize a new project
flightplan init my-data-platform

# Deploy to cloud
flightplan deploy --cloud aws
```

### 2. Create Your First Pipeline

```yaml
# flightplan.yaml
pipelines:
  - name: daily_analytics
    schedule: "0 2 * * *"  # 2 AM daily
    tasks:
      - name: extract
        type: duckdb
        query: |
          COPY (SELECT * FROM read_parquet('s3://data/*.parquet'))
          TO 'staging/daily.db';

      - name: transform
        type: duckdb
        depends_on: [extract]
        extensions: [json_transform, stats_advanced]
        query: |
          CREATE OR REPLACE TABLE analytics AS
          SELECT
            date_trunc('day', timestamp) as day,
            user_segment,
            count(*) as events,
            avg(value) as avg_value
          FROM staging.events
          GROUP BY day, user_segment;

      - name: publish
        type: api
        depends_on: [transform]
        endpoint: https://dashboard.company.com/api/update
```

### 3. Monitor and Optimize

Access the Flightplan UI to:
- View pipeline runs and status
- Analyze performance metrics
- Set up alerts for failures
- Optimize resource allocation

## Pricing

Flightplan is available in three tiers:

**Starter** - $99/month
- Up to 10 pipelines
- 1,000 task executions/month
- Community support

**Professional** - $499/month
- Unlimited pipelines
- 10,000 task executions/month
- Email support
- Advanced monitoring

**Enterprise** - Custom pricing
- Unlimited everything
- Dedicated support
- Custom SLAs
- On-premise deployment

All tiers include DuckDB integration and visual pipeline builder.

## What's Next

We're already working on v1.1 with exciting features:

- **Auto-scaling** - Dynamic resource allocation based on workload
- **ML Integration** - First-class support for model training and deployment
- **Data Catalog** - Automatic discovery and documentation
- **Cost Optimization** - AI-powered recommendations to reduce cloud spend

## Try Flightplan Today

Ready to modernize your data infrastructure?

- [Start a free 14-day trial](/products/services)
- [Schedule a demo](/company/schedule) with our team
- [Read the documentation](https://docs.query.farm/flightplan)
- [Join our community](https://github.com/queryfarm/flightplan)

We can't wait to see what you'll build with Flightplan! 🚜

---

*Questions? [Contact our team](/company/contact) - we're here to help!*
