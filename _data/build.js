// Build metadata. `time` versions the service-worker precache and runtime
// caches (sw.njk): each build gets fresh names and activation deletes the
// previous ones so offline storage does not grow unboundedly. Millisecond
// precision so back-to-back deploys can never share a cache name.
export default {
  time: new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, ''),
};
