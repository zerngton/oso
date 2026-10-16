# Ayvan Residence

A scroll-driven website for a luxury villa: the house rises from bare ground to finished building as you scroll, then the camera moves through the door and into each room.

- `site.html` is the source page (body only, as published to Claude Artifacts).
- `index.html` is the full document for any static host (GitHub Pages, Netlify). Rebuild it with `tools/build.sh`.
- `assets/img/` holds the images, generated with Higgsfield.
- `tools/add-walkthrough.sh video.mp4` turns a walk-through video into frames that play as you scroll.
- `CHATGPT_PROMPTS.md` has the prompts for generating that video with Sora.

Built with GSAP ScrollTrigger and Lenis, loaded from public CDNs.
