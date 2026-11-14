import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";

import waiting from "../../assets/scenery/interior.png";
import control from "../../assets/experience/control-room.png";
import botanical from "../../assets/scenery/botanical.png";
import stairs from "../../assets/experience/stairwell.png";
import hall from "../../assets/experience/office-hall.png";
import reception from "../../assets/experience/reception.png";
import arrival from "../../assets/scenery/arrival.png";
import signal from "../../assets/scenery/signal.png";
import bloom from "../../assets/scenery/clinical-bloom.png";
import reflection from "../../assets/scenery/withheld-reflection.png";
import passage from "../../assets/scenery/closed-passage.png";
import type { SceneId, SceneImage } from "./types";

type SceneSource = Omit<SceneImage, "src" | "srcSet" | "width" | "height"> & {
  image: ImageMetadata;
};

const sources: SceneSource[] = [
  {
    id: "waiting",
    number: "01",
    name: "Waiting area",
    location: "WEST WING",
    label: "CAM 01 / WEST WING",
    description: "01 / WAITING AREA — WEST WING",
    alt: "Fictional surveillance view of an empty institutional waiting area, with chairs, a lamp, and an open doorway.",
    image: waiting
  },
  {
    id: "control",
    number: "02",
    name: "Control room",
    location: "OBSERVATION",
    label: "CAM 02 / OBSERVATION",
    description: "02 / CONTROL ROOM — UPPER RIGHT",
    alt: "Fictional surveillance view from the upper-right ceiling corner of an empty control room. An empty chair faces a terminal showing the same empty room.",
    image: control
  },
  {
    id: "botanical",
    number: "03",
    name: "Botanical study",
    location: "BOTANICAL",
    label: "CAM 03 / BOTANICAL",
    description: "03 / BOTANICAL STUDY — DETAIL RETAINED",
    alt: "A pale, aging flower with curled green and cream petals against a dark background.",
    image: botanical
  },
  {
    id: "stairs",
    number: "04",
    name: "Lower stair",
    location: "SERVICE ACCESS",
    label: "CAM 04 / LOWER STAIR",
    description: "04 / LOWER STAIR — SERVICE ACCESS",
    alt: "An empty institutional stairwell under dim light, with cream walls and metal handrails.",
    image: stairs
  },
  {
    id: "hall",
    number: "05",
    name: "Office hall",
    location: "EAST WING",
    label: "CAM 05 / EAST WING",
    description: "05 / OFFICE HALL — EAST WING",
    alt: "An empty office hallway with closed doors and a slightly crooked framed picture.",
    image: hall
  },
  {
    id: "reception",
    number: "06",
    name: "Reception",
    location: "PUBLIC INTERIOR",
    label: "CAM 06 / RECEPTION",
    description: "06 / RECEPTION — PUBLIC INTERIOR",
    alt: "An empty, presentable corporate reception area with a desk and quiet institutional lighting.",
    image: reception
  },
  {
    id: "arrival",
    number: "07",
    name: "Town approach",
    location: "COMMUNITY EXTERIOR",
    label: "CAM 07 / TOWN APPROACH",
    description: "07 / TOWN APPROACH — COMMUNITY EXTERIOR",
    alt: "A deserted town street at night, with rundown brick storefronts and a dark passage between buildings.",
    image: arrival
  },
  {
    id: "signal",
    number: "08",
    name: "Signal room",
    location: "TRANSMISSION",
    label: "CAM 08 / TRANSMISSION",
    description: "08 / SIGNAL ROOM — TRANSMISSION RETAINED",
    alt: "A CRT television showing a pale flower on a trolley in a dim, worn utility room.",
    image: signal
  },
  {
    id: "bloom",
    number: "09",
    name: "Clinical bloom",
    location: "STILL LIFE",
    label: "CAM 09 / CLINICAL BLOOM",
    description: "09 / CLINICAL BLOOM — STILL LIFE RETAINED",
    alt: "A pale flower in an upright glass on a clinical tile shelf, with the waterline tilted independently of the glass.",
    image: bloom
  },
  {
    id: "reflection",
    number: "10",
    name: "Reflection room",
    location: "CONSULTATION",
    label: "CAM 10 / REFLECTION",
    description: "10 / REFLECTION ROOM — CONSULTATION RETAINED",
    alt: "An empty chair faces a wall mirror whose image is a different empty corridor.",
    image: reflection
  },
  {
    id: "passage",
    number: "11",
    name: "Closed passage",
    location: "ACCESS RETAINED",
    label: "CAM 11 / CLOSED PASSAGE",
    description: "11 / CLOSED PASSAGE — ACCESS RETAINED",
    alt: "A clinical passage ends at a doorframe surrounding unbroken wall tiles, with a floor guide line continuing up the wall.",
    image: passage
  }
];

let images: Promise<SceneImage[]> | undefined;

/** Shared build-time optimization; no source PNGs or server code enter React. */
export function getSceneImages(): Promise<SceneImage[]> {
  return (images ??= Promise.all(
    sources.map(async ({ image, ...scene }) => {
      const widths = [480, 768, 1280].filter((width) => width <= image.width);
      const variants = await Promise.all(
        widths.map((width) =>
          getImage({ src: image, width, format: "webp", quality: 78 })
        )
      );
      const largest = variants[variants.length - 1];
      return {
        ...scene,
        src: largest.src,
        srcSet: variants
          .map((variant, index) => `${variant.src} ${widths[index]}w`)
          .join(", "),
        width: widths[widths.length - 1],
        height: Math.round(
          (image.height * widths[widths.length - 1]) / image.width
        )
      };
    })
  ));
}

export function sceneById(scenes: SceneImage[], id: SceneId): SceneImage {
  const scene = scenes.find((candidate) => candidate.id === id);
  if (!scene) throw new Error(`Missing retained scene: ${id}`);
  return scene;
}
