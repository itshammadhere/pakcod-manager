// FIXED: Added Authorization: Bearer <CRON_SECRET> header to cron endpoint calls.
export function setupScheduler() {
  const cronInterval = parseInt(process.env.TRACKING_SYNC_INTERVAL || "7200000");
  const cronSecret = process.env.CRON_SECRET || "";

  const syncTracking = async () => {
    console.log(`[${new Date().toISOString()}] Running tracking sync...`);
    try {
      const response = await fetch(
        `${process.env.SHOPIFY_APP_URL}/api/cron/sync-tracking`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${cronSecret}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (response.ok) {
        console.log("Tracking sync completed");
      } else {
        console.error("Tracking sync failed:", await response.text());
      }
    } catch (error) {
      console.error("Tracking sync error:", error);
    }
  };

  const cancelUnconfirmed = async () => {
    console.log(`[${new Date().toISOString()}] Checking for unconfirmed orders...`);
    try {
      const response = await fetch(
        `${process.env.SHOPIFY_APP_URL}/api/cron/cancel-unconfirmed`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${cronSecret}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (response.ok) {
        console.log("Unconfirmed orders check completed");
      }
    } catch (error) {
      console.error("Cancel unconfirmed error:", error);
    }
  };

  setTimeout(() => {
    syncTracking();
    cancelUnconfirmed();
  }, 60000);

  const trackingInterval = setInterval(syncTracking, cronInterval);
  const cancelInterval = setInterval(cancelUnconfirmed, 3600000);

  return () => {
    clearInterval(trackingInterval);
    clearInterval(cancelInterval);
  };
}
