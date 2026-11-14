import {
  Component,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { SceneImage } from "./types";
import { ReadoutPanels } from "./console/ReadoutPanels";
import { displayedId, feedReducer, initialFeed } from "./console/state";
import { localTime } from "./console/readouts";
import { useActivity } from "./console/useActivity";
import {
  useAmbientSignal,
  useBrowserReadings,
  useNetworkReadings
} from "./console/useReadings";
import "./experience.css";

interface Props {
  scenes: SceneImage[];
  networkEndpoint: string;
}
interface BoundaryProps {
  children: ReactNode;
  onReset: () => void;
}

export class ConsoleErrorBoundary extends Component<
  BoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="experience-console console-fallback" role="alert">
          <h2>Station unavailable</h2>
          <p>
            The interactive circuit could not be restored. Retained views and
            Disconnect remain available.
          </p>
          <button
            type="button"
            onClick={() => {
              this.props.onReset();
              this.setState({ failed: false });
            }}
          >
            Retry station
          </button>
          <a href="#retained-views">Open retained views</a>
        </div>
      );
    return this.props.children;
  }
}

function ConsoleSession({
  scenes,
  networkEndpoint,
  onReset
}: Props & { onReset: () => void }) {
  const first = scenes.find((scene) => scene.id === "waiting") ?? scenes[0];
  const initialId = first?.id ?? "waiting";
  const [feed, dispatch] = useReducer(feedReducer, initialFeed(initialId));
  const rootRef = useRef<HTMLDivElement>(null);
  const { ready, activity, dispatch: record } = useActivity(rootRef, initialId);
  const readings = useBrowserReadings();
  const { network, networkStatus } = useNetworkReadings(networkEndpoint);
  const { ambient, reduced, setRequested } = useAmbientSignal();
  const selected =
    scenes.find((scene) => scene.id === feed.selectedId) ?? first;
  const displayed =
    scenes.find((scene) => scene.id === displayedId(feed)) ?? first;
  const echo = scenes.find((scene) => scene.id === feed.echoId) ?? first;
  const motion = ready && ambient && activity.visible;

  useEffect(() => {
    if (!motion) {
      dispatch({ type: "echo", id: feed.selectedId });
      return;
    }
    const timer = setTimeout(
      () => dispatch({ type: "echo", id: feed.selectedId }),
      900
    );
    return () => clearTimeout(timer);
  }, [feed.selectedId, motion]);

  if (!first || !selected || !displayed || !echo)
    return (
      <div className="experience-console console-fallback">
        <h2>No retained signal</h2>
        <p>The interactive views are unavailable.</p>
        <a href="#retained-views">Open retained views</a>
      </div>
    );

  function select(scene: SceneImage) {
    dispatch({ type: "select", id: scene.id });
    record({ type: "select", id: scene.id, name: scene.name, now: Date.now() });
  }

  return (
    <div
      className="experience-console"
      ref={rootRef}
      data-ready={ready}
      data-motion={motion ? "on" : "off"}
    >
      <section className="display-housing" aria-label="Observation monitor">
        <div className="display-top">
          <p>Local monitor / 04</p>
          <p className="assurance">No one has been overlooked.</p>
        </div>
        <div className="screen-body">
          <figure className="scene" aria-label="Selected camera view">
            <img
              key={`${displayed.id}-${feed.imageAttempt}`}
              className="feed-image"
              src={displayed.src}
              srcSet={displayed.srcSet}
              sizes="(max-width: 1100px) 100vw, 90vw"
              width={displayed.width}
              height={displayed.height}
              alt={displayed.alt}
              fetchPriority="high"
              decoding="async"
              onError={() => dispatch({ type: "image-failed" })}
            />
            {displayed.id === "control" && !feed.imageFailed && (
              <div className="monitor-window" aria-hidden="true">
                <div className="mini-console">
                  <div className="mini-top" />
                  <div className="mini-image">
                    <img src={echo.src} alt="" decoding="async" />
                    {echo.id === "control" && (
                      <div className="mini-recursion" />
                    )}
                  </div>
                  <div className="mini-dock" />
                </div>
              </div>
            )}
            {motion && (
              <>
                <div className="scanlines" aria-hidden="true" />
                <div className="roll" aria-hidden="true" />
              </>
            )}
            <div className="osd osd-top" aria-hidden="true">
              <span>
                CAM {displayed.number} / {displayed.location}
              </span>
              <span className="osd-clock">
                <time>
                  {ready ? localTime(new Date(activity.now)) : "--:--:--"}
                </time>
                <span className="clock-basis">LOCAL</span>
              </span>
            </div>
            <div className="osd osd-bottom" aria-hidden="true">
              <span>
                {feed.heldId
                  ? "Held image / local clock continues"
                  : "Current image"}
              </span>
              <span>Continuous service</span>
            </div>
            <p className="activity-osd" aria-hidden="true">
              {ready ? activity.notice : ""}
            </p>
            {feed.imageFailed && (
              <div className="signal-error" role="alert">
                <p>Image unavailable</p>
                <p>The view can be requested again.</p>
                <button
                  className="retry"
                  type="button"
                  disabled={!ready}
                  onClick={() => dispatch({ type: "retry" })}
                >
                  Retry image
                </button>
                <a href="#retained-views">Open retained views</a>
              </div>
            )}
          </figure>
        </div>
        <div className="signal-strip">
          <p>{displayed.description}</p>
          <p>
            <span>
              {feed.imageFailed
                ? "Signal unavailable"
                : feed.heldId
                  ? "Image held"
                  : "Signal present"}
            </span>{" "}
            · {scenes.length} channels
          </p>
        </div>
      </section>
      <div className="equipment-dock" hidden={!ready}>
        <div
          className="channel-bank"
          role="group"
          aria-label="Camera selection"
        >
          <span className="bank-label">Input select / retained views</span>
          {scenes.map((scene) => (
            <button
              className="channel"
              key={scene.id}
              type="button"
              disabled={!ready}
              aria-pressed={scene.id === feed.selectedId}
              onClick={() => select(scene)}
            >
              <span className="channel-number" aria-hidden="true">
                {scene.number}
              </span>
              <span>
                <span className="channel-name">{scene.name}</span>
                <span className="channel-note">{scene.label}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="utilities">
          <button
            className="hold"
            type="button"
            disabled={!ready}
            aria-pressed={feed.heldId !== null}
            onClick={() => dispatch({ type: "hold" })}
          >
            {feed.heldId ? "Release image" : "Hold image"}
          </button>
          <label className="motion-choice">
            <input
              type="checkbox"
              checked={ambient}
              disabled={!ready || reduced}
              onChange={(event) => setRequested(event.currentTarget.checked)}
            />
            Ambient signal
            {reduced && (
              <span className="motion-note">Reduced motion active</span>
            )}
          </label>
          <button
            className="hold reset-station"
            type="button"
            disabled={!ready}
            onClick={onReset}
          >
            Reset station
          </button>
        </div>
      </div>
      {ready ? (
        <ReadoutPanels
          activity={activity}
          readings={readings}
          network={network}
          networkStatus={networkStatus}
          selectedName={selected.name}
        />
      ) : (
        <p className="console-loading">
          Interactive controls attach when the local circuit is ready.{" "}
          <a href="#retained-views">Open retained views</a>.
        </p>
      )}
      <div className="bottom-rail" aria-hidden="true">
        <span className="screw" />
        <p>BROOD Civic Systems / local circuit</p>
        <span className="vents" />
        <p>Station 04</p>
        <span className="screw" />
      </div>
    </div>
  );
}

export default function ExperienceRoot(props: Props) {
  const [revision, setRevision] = useState(0);
  const reset = () => setRevision((value) => value + 1);
  return (
    <ConsoleErrorBoundary onReset={reset}>
      <ConsoleSession {...props} key={revision} onReset={reset} />
    </ConsoleErrorBoundary>
  );
}
