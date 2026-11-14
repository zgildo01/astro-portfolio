import type { NetworkReadout } from "../types";
import { duration, localDate, localTime, utcOffset } from "./readouts";
import { visibleSelectionMs, type ActivityState } from "./state";
import type { BrowserReadings } from "./useReadings";

interface Props {
  activity: ActivityState;
  readings: BrowserReadings;
  network: NetworkReadout | null;
  networkStatus: "pending" | "available" | "unavailable";
  selectedName: string;
}

export function ReadoutPanels({
  activity,
  readings,
  network,
  networkStatus,
  selectedName
}: Props) {
  const now = new Date(activity.now);
  const opened = new Date(activity.startedAt);
  const networkFallback =
    networkStatus === "pending" ? "Request pending" : "Unavailable";
  const region = [
    ...new Set(
      [network?.city, network?.region, network?.country].filter(Boolean)
    )
  ].join(" / ");
  return (
    <>
      <section className="observer-panel" aria-labelledby="observer-heading">
        <header className="observer-header">
          <h2 id="observer-heading">Local return / observer</h2>
          <p>
            Your side of the circuit.{" "}
            <span className="observer-status">
              {activity.visible ? "Active tab" : "Background tab"}
            </span>
          </p>
        </header>
        <dl className="observer-grid" aria-live="off">
          <div>
            <dt>Local time</dt>
            <dd>
              <time className="observer-time" dateTime={now.toISOString()}>
                {localTime(now)}
              </time>
              <small>{localDate(now)}</small>
            </dd>
          </div>
          <div>
            <dt>Reported time zone</dt>
            <dd>
              {readings.zone}
              <small>{utcOffset(now)}</small>
            </dd>
          </div>
          <div>
            <dt>Reported client</dt>
            <dd>
              {readings.client}
              <small>{readings.platform}</small>
            </dd>
          </div>
          <div>
            <dt>Language setting</dt>
            <dd>{readings.locale}</dd>
          </div>
          <div>
            <dt>Viewport</dt>
            <dd>{readings.viewport}</dd>
          </div>
          <div>
            <dt>Reported display</dt>
            <dd>{readings.display}</dd>
          </div>
          <div>
            <dt>Input capability</dt>
            <dd>{readings.input}</dd>
          </div>
          <div>
            <dt>Session attached</dt>
            <dd>
              <time dateTime={opened.toISOString()}>{localTime(opened)}</time>
              <small>
                Elapsed {duration(activity.now - activity.startedAt)}
              </small>
            </dd>
          </div>
        </dl>
        <details className="readout-source">
          <summary>Readout source</summary>
          <p>
            These settings are reported by this browser, in this tab. Privacy
            tools may limit or alter them. The time zone is a device setting,
            not a verified location. The reported client is inferred from a
            browser identifier that can be changed.
          </p>
          <p>
            This fictional study does not sign into an account or save a visitor
            profile. Browser and activity readings stay in this page; the
            activity log is cleared on reload or station reset. Network readings
            come from the current Worker request and are not copied into the
            activity log.
          </p>
        </details>
      </section>
      <div className="telemetry-bay">
        <details className="observer-panel">
          <summary className="disclosure-key">
            Terminal / network readings
          </summary>
          <dl className="observer-grid" aria-live="off">
            <div>
              <dt>Reported logical threads</dt>
              <dd>{readings.threads}</dd>
            </div>
            <div>
              <dt>Approximate memory</dt>
              <dd>{readings.memory}</dd>
            </div>
            <div>
              <dt>Reported battery</dt>
              <dd>{readings.battery}</dd>
            </div>
            <div>
              <dt>Reported power state</dt>
              <dd>{readings.power}</dd>
            </div>
            <div>
              <dt>Connection estimate</dt>
              <dd>{readings.connection}</dd>
            </div>
          </dl>
          <h3 className="bay-heading">Network return / IP-derived</h3>
          <dl className="observer-grid" aria-live="off">
            <div>
              <dt>Public connection address</dt>
              <dd>{network?.clientIp ?? networkFallback}</dd>
            </div>
            <div>
              <dt>Reported network region</dt>
              <dd>{region || networkFallback}</dd>
            </div>
            <div>
              <dt>Network provider</dt>
              <dd>{network?.provider ?? networkFallback}</dd>
            </div>
          </dl>
          <p className="bay-note">
            {networkStatus === "available"
              ? "IP-derived network location may describe a proxy or VPN, rather than a physical location."
              : networkStatus === "pending"
                ? "Requesting the network return from this site's Worker."
                : "The network readout is unavailable. Local readings remain active."}
          </p>
          {network && (
            <p className="bay-note">
              Source: {network.source}. Location basis: {network.locationBasis}.
            </p>
          )}
          <p className="bay-note">
            Hardware and power values are browser reports. Logical threads are
            not physical processor cores. Memory and connection speed are
            estimates. Some browsers limit or omit these readings.
          </p>
        </details>
        <details className="observer-panel" open>
          <summary className="disclosure-key">
            Local observation / activity
          </summary>
          <p
            className="activity-message"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {activity.notice}
          </p>
          <dl className="observer-grid" aria-live="off">
            <div>
              <dt>Since console input</dt>
              <dd>{duration(activity.now - activity.lastInputAt)}</dd>
            </div>
            <div>
              <dt>Last hidden interval</dt>
              <dd>
                {activity.awayMs === null ? "—" : duration(activity.awayMs)}
              </dd>
            </div>
            <div>
              <dt>Selected view</dt>
              <dd>{selectedName}</dd>
            </div>
            <div>
              <dt>Visible selection time</dt>
              <dd>{duration(visibleSelectionMs(activity))}</dd>
            </div>
            <div>
              <dt>Actual view entries</dt>
              <dd>{activity.rooms[activity.selectedId]?.visits ?? 0}</dd>
            </div>
            <div>
              <dt>Information handling</dt>
              <dd>{activity.copyNotice ? "Notice issued" : "No incident"}</dd>
            </div>
          </dl>
          <ol
            className="activity-log"
            aria-label="Recent local events"
            tabIndex={0}
          >
            {activity.events.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <time dateTime={new Date(event.at).toISOString()}>
                  {localTime(new Date(event.at))}
                </time>
                <span>{event.message}</span>
              </li>
            ))}
          </ol>
          <p className="bay-note">
            Only room changes, input timing, tab visibility, and notices are
            retained here. Typed keys and selected or copied content are never
            recorded. Selection, copying, and Disconnect remain available.
          </p>
        </details>
      </div>
    </>
  );
}
