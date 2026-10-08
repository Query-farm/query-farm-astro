#import "template.typ": *
#let examples = json("examples.json").stochastic
#show: sheet.with(extension: "Stochastic", revision: sys.inputs.at("revision"), pages: 2)

#masthead("Stochastic", "stochastic", [Probability, sampling & Monte Carlo. All in SQL.])
#installation("stochastic")
#v(8pt)

#grid(columns: (1fr, 1fr), gutter: 20pt,
  [
    #section("01", "One naming pattern")
    #sql("dist_<family>_<operation>(params..., x)")
    #text(size: 8.2pt)[Distribution parameters come first. Add `x` for density or cumulative probability, `p` for a quantile, and neither for sampling or properties.]
    #v(3pt)
    #reference-table(([Operation suffix], [Returns]), (
      (`sample`, [One random draw]),
      (`pdf`, [Density / discrete mass¹]),
      (`cdf`, [Left tail: P(X ≤ x)]),
      (`cdf_complement`, [Right tail: P(X > x)]),
      (`quantile`, [Inverse CDF at p]),
      (`quantile_complement`, [Inverse right tail at p]),
      (`log_pdf`, [Natural log of PDF]),
      (`log_cdf`, [Natural log of CDF]),
      (`log_cdf_complement`, [Natural log of right tail]),
      (`hazard`, [PDF / right tail]),
      (`chf`, [−ln(right tail)]),
    ), widths: (1.25fr, 1fr), size: 7.6pt)
    #v(5pt)
    #text(weight: 600, size: 8.3pt)[Properties: no trailing x or p]
    #v(3pt)
    #text(size: 8pt)[`mean`, `median`, `mode`, `variance`, `stddev`, `skewness`, `kurtosis`, `kurtosis_excess`, `range`, `support`. Availability depends on the family; `range` and `support` return two-element arrays.]

    #section("02", "Read the probability")
    #image("assets/probability.svg", width: 100%)
    #text(size: 8pt)[The CDF is the shaded area left of x. Its complement is the area to the right. For continuous distributions, `pdf(x)` is a density, not P(X = x).]
    #v(4pt)
    #note("Tail arithmetic", [
      For discrete counts: P(X ≥ k) = `cdf_complement(params..., k-1)`. Call the complement directly rather than subtracting a CDF from 1.
    ])
  ],
  [
    #section("03", "Normal: quantiles & CDFs")
    #text(size: 8pt)[Parameters are mean and *standard deviation*.]
    #sql(examples.normal)

    #section("04", "Count probabilities")
    #sql(examples.tails)

    #section("05", "Generate → evaluate → average")
    #text(size: 8pt)[Estimate π from uniform points in the square. Materialize draws so every expression reuses the same sampled coordinates.]
    #sql(examples.monte_carlo)
    #small[Result varies by run and approaches π as the sample size grows.]
    #v(5pt)
    #note("Keep draws for reproducibility", [
      `_sample` has no seed argument. Save draws with `CREATE TABLE ... AS SELECT ...` and reuse that table for repeatable analysis.
    ])
    #v(4pt)
    #small[¹ `uniform_int` uses inclusive integer endpoints; see page 2. Discrete quantiles use family-specific rounding.]
    #docs("stochastic")
  ],
)

#pagebreak()
#masthead("Stochastic", "stochastic", [The distribution directory], page-label: "FAMILIES & PARAMETERS")
#text(size: 8.5pt)[Use the family token in `dist_<family>_<operation>`. Parameters below are listed in call order; append `x` or `p` when the operation needs it.]
#v(5pt)

#grid(columns: (1fr, 1fr), gutter: 20pt,
  [
    #section("06", "Continuous families")
    #reference-table(([Family token], [Parameters / interpretation]), (
      (`beta`, [alpha, beta\ Positive shapes; proportions]),
      (`cauchy`, [location, scale\ Heavy tails; no mean / variance]),
      (`chi_squared`, [df\ Positive degrees of freedom]),
      (`exponential`, [rate\ Mean waiting time = 1/rate]),
      (`extreme_value`, [location, scale\ Gumbel; block maxima]),
      (`fisher_f`, [df1, df2\ Ratio of scaled variances]),
      (`gamma`, [shape, scale\ Both positive; mean = shape × scale]),
      (`laplace`, [location, scale\ Symmetric, sharper peak]),
      (`logistic`, [location, scale\ Symmetric, heavier tails]),
      (`lognormal`, [meanlog, sdlog\ Parameters of ln(X)]),
      (`normal`, [mean, stddev\ Location and spread]),
      (`pareto`, [scale, shape \*\ Lower bound and tail shape]),
      (`rayleigh`, [scale\ Nonnegative magnitudes]),
      (`students_t`, [df\ Standard t; positive df]),
      (`uniform_real`, [min, max\ min < max]),
      (`weibull`, [shape, scale\ Both positive; failure times]),
    ), widths: (1fr, 1.5fr), size: 7.6pt)
    #v(6pt)
    #small[\* Pareto’s runtime order is (scale, shape). Fixed v1.5 labels match this order. Older 234c881 labels incorrectly say (shape, minimum).]
  ],
  [
    #section("07", "Discrete sampling families")
    #reference-table(([Family token], [Parameters / interpretation]), (
      (`bernoulli`, [p\ A Boolean draw; 0 ≤ p ≤ 1]),
      (`binomial`, [trials, p\ Successes in a fixed trial count]),
      (`geometric`, [p\ Failures before first success]),
      (`negative_binomial`, [successes, p\ Failures before target successes]),
      (`poisson`, [rate\ Positive expected event count]),
      (`uniform_int`, [min, max\ Integer draws; both ends included]),
    ), widths: (1.1fr, 1.5fr), size: 7.6pt)
    #v(7pt)
    #note("Integer uniform: inclusive endpoints", [
      Fixed v1.5 analytics match integer sampling. For bounds 1 to 6, PMF = 1/6, CDF at 3 = 0.5, mean = 3.5 and variance = 35/12. Older 234c881 uses incorrect continuous formulas and truncates moments.
    ])

    #section("08", "Make a synthetic dataset")
    #sql(examples.synthetic, size: 7.3pt)
    #text(size: 8pt)[Each row receives fresh draws. Bernoulli returns `BOOLEAN`; other discrete samplers return `BIGINT`; continuous samplers return `DOUBLE`.]

    #section("09", "Check the installed surface")
    #sql(examples.inspect, size: 7.4pt)
    #small[Use positive scales and standard deviations. Properties may be undefined at some parameter values; invalid inputs can raise SQL errors.]
    #docs("stochastic")
  ],
)
