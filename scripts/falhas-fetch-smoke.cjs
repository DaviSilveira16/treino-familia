function falhaNativaEsperada(report, cancelledRequests, fetchFailures) {
  return report.offline || cancelledRequests.has(report.url) ||
    fetchFailures.some((failure) =>
      failure.url === report.url &&
      (failure.offline || failure.aborted || failure.unloading) &&
      Math.abs(failure.at - report.at) < 1000,
    );
}

module.exports = { falhaNativaEsperada };
