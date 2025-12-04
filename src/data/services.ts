export interface Service {
  id: string;
  name: string;
  tagline: string;
  description: string;
  features: string[];
  benefits: string[];
  icon?: string;
  useCases?: string[];
}

export const services: Service[] = [
  {
    id: 'flightplan',
    name: 'Flightplan',
    tagline: 'Unified Data Ecosystem Orchestration',
    description: 'Flightplan is Query.Farm\'s flagship data orchestration platform that unifies your entire data ecosystem. Seamlessly coordinate data pipelines, transformations, and analytics workflows across DuckDB and your existing infrastructure with intelligent routing, dependency management, and real-time monitoring.',
    icon: '✈️',
    features: [
      'Unified data pipeline orchestration across multiple systems',
      'Visual workflow designer with drag-and-drop interface',
      'Real-time monitoring and alerting',
      'Automatic dependency resolution and execution ordering',
      'Version control and rollback capabilities',
      'Built-in error handling and retry logic',
      'Integration with popular data tools (dbt, Airflow, Dagster)',
      'Cloud-native deployment (AWS, GCP, Azure)',
      'API-first architecture for programmatic control',
      'Role-based access control and audit logging'
    ],
    benefits: [
      'Reduce pipeline development time by 60%',
      'Eliminate data silos with unified orchestration',
      'Improve data quality with automated validation',
      'Scale effortlessly with cloud-native architecture',
      'Lower total cost of ownership vs traditional ETL tools'
    ],
    useCases: [
      'Multi-source data integration and transformation',
      'Real-time analytics pipeline management',
      'Data warehouse modernization',
      'Machine learning workflow orchestration',
      'Cross-cloud data synchronization'
    ]
  },
  {
    id: 'airport',
    name: 'Airport as a Service',
    tagline: 'Managed DuckDB Infrastructure',
    description: 'Airport provides fully-managed DuckDB infrastructure in the cloud, eliminating operational overhead while maximizing performance. Deploy scalable DuckDB instances with automatic backups, monitoring, and optimization - all managed by Query.Farm\'s expert team.',
    icon: '🛬',
    features: [
      'Fully-managed DuckDB instances in your cloud or ours',
      'Automatic scaling based on workload demands',
      'Continuous backups with point-in-time recovery',
      'Built-in monitoring and performance optimization',
      'High availability with automatic failover',
      'Security hardening and compliance certifications',
      'Extension marketplace with one-click installation',
      'Dedicated support from DuckDB experts',
      'Custom SLA options for enterprise customers',
      'Zero-downtime upgrades and maintenance'
    ],
    benefits: [
      'Deploy production-ready DuckDB in minutes',
      'Eliminate DevOps overhead and maintenance burden',
      'Predictable monthly pricing with no hidden costs',
      '99.9% uptime SLA with automatic failover',
      'Expert support from the Query.Farm team'
    ],
    useCases: [
      'Embedded analytics for SaaS applications',
      'Data science and ML model training infrastructure',
      'Business intelligence and reporting systems',
      'Data lake query engine',
      'Development and testing environments'
    ]
  }
];

export const getServiceById = (id: string): Service | undefined => {
  return services.find(service => service.id === id);
};
