// Drag-and-drop block library for the admin HTML editor.
//
// These are pure HTML + CSS, deliberately. The obvious thing to want here is
// ReactBits itself, but those are JSX components built on GSAP / Framer Motion /
// three.js / ogl: they need a React runtime and a bundler, and the preview runs
// with scripts disabled so the document can stay editable. A dropped block has
// to keep working in the downloaded .html with no build step and no network, so
// everything below is markup and stylesheet only — animation via CSS keyframes.
//
// Categories mirror reactbits.dev so the two are easy to cross-reference, and
// block names match the ReactBits component they're modelled on where one
// exists. Effects that genuinely require JS or WebGL (cursor followers, shader
// backgrounds, scramble/decrypt text, physics) aren't representable here and
// are left out rather than faked badly.
//
// Each block is self-contained: its own uniquely-prefixed class names plus the
// <style> it needs. Dropping the same block twice duplicates the rules, which
// is harmless — identical selectors and keyframes.

export type BlockCategory = "Text" | "Animations" | "Components" | "Backgrounds";

export interface HtmlBlock {
  id: string;
  name: string;
  category: BlockCategory;
  /** one-line description shown on hover */
  hint: string;
  html: string;
}

export const BLOCK_CATEGORIES: BlockCategory[] = [
  "Text",
  "Animations",
  "Components",
  "Backgrounds",
];

export const HTML_BLOCKS: HtmlBlock[] = [
  // ------------------------------------------------------------------
  // Text animations
  // ------------------------------------------------------------------
  {
    id: "gradient-text",
    name: "Gradient Text",
    category: "Text",
    hint: "Heading with an animated gradient sweep",
    html: `<h2 class="rb-gradient-text">Gradient heading</h2>
<style>
.rb-gradient-text{font:700 clamp(28px,5vw,52px)/1.15 system-ui,sans-serif;margin:0 0 12px;
  background:linear-gradient(90deg,#3f8e84,#6ee7d5,#3f8e84,#a78bfa,#3f8e84);
  background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
  animation:rb-gradient-pan 6s linear infinite}
@keyframes rb-gradient-pan{to{background-position:300% 0}}
</style>`,
  },
  {
    id: "shiny-text",
    name: "Shiny Text",
    category: "Text",
    hint: "Light sweeping across the letters",
    html: `<h2 class="rb-shiny">Shiny text</h2>
<style>
.rb-shiny{font:700 clamp(24px,4vw,42px)/1.2 system-ui,sans-serif;margin:0 0 12px;color:#8b98a5;
  background:linear-gradient(100deg,transparent 30%,#fff 50%,transparent 70%) 0 0/220% 100% no-repeat,
             linear-gradient(#8b98a5,#8b98a5);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  animation:rb-shine 3.2s linear infinite}
@keyframes rb-shine{to{background-position:-220% 0,0 0}}
</style>`,
  },
  {
    id: "glitch-text",
    name: "Glitch Text",
    category: "Text",
    hint: "RGB-split glitch on a headline",
    html: `<h2 class="rb-glitch" data-text="Glitch text">Glitch text</h2>
<style>
.rb-glitch{position:relative;font:800 clamp(28px,5vw,52px)/1.1 system-ui,sans-serif;margin:0 0 12px;color:#e6edf3;letter-spacing:-.02em}
.rb-glitch::before,.rb-glitch::after{content:attr(data-text);position:absolute;inset:0;background:inherit}
.rb-glitch::before{color:#ff4d6d;animation:rb-glitch-a 2.4s steps(2,end) infinite}
.rb-glitch::after{color:#4dd8ff;animation:rb-glitch-b 3.1s steps(2,end) infinite}
@keyframes rb-glitch-a{0%,92%,100%{transform:none;clip-path:inset(0)}94%{transform:translate(-3px,1px);clip-path:inset(12% 0 58% 0)}97%{transform:translate(2px,-1px);clip-path:inset(66% 0 8% 0)}}
@keyframes rb-glitch-b{0%,90%,100%{transform:none;clip-path:inset(0)}93%{transform:translate(3px,-2px);clip-path:inset(40% 0 34% 0)}96%{transform:translate(-2px,1px);clip-path:inset(76% 0 4% 0)}}
</style>`,
  },
  {
    id: "blur-text",
    name: "Blur Text",
    category: "Text",
    hint: "Words resolving out of a blur, staggered",
    html: `<h2 class="rb-blur"><span>Focus</span> <span>arrives</span> <span>word</span> <span>by</span> <span>word</span></h2>
<style>
.rb-blur{font:700 clamp(24px,4vw,44px)/1.2 system-ui,sans-serif;margin:0 0 12px;color:#e6edf3}
.rb-blur span{display:inline-block;filter:blur(10px);opacity:0;animation:rb-unblur .8s cubic-bezier(.2,.7,.3,1) forwards}
.rb-blur span:nth-child(2){animation-delay:.12s}.rb-blur span:nth-child(3){animation-delay:.24s}
.rb-blur span:nth-child(4){animation-delay:.36s}.rb-blur span:nth-child(5){animation-delay:.48s}
@keyframes rb-unblur{to{filter:blur(0);opacity:1}}
</style>`,
  },
  {
    id: "split-text",
    name: "Split Text",
    category: "Text",
    hint: "Per-letter rise, staggered",
    html: `<h2 class="rb-split"><span>S</span><span>p</span><span>l</span><span>i</span><span>t</span><span>&nbsp;</span><span>t</span><span>e</span><span>x</span><span>t</span></h2>
<style>
.rb-split{font:800 clamp(28px,5vw,52px)/1.1 system-ui,sans-serif;margin:0 0 12px;color:#e6edf3}
.rb-split span{display:inline-block;transform:translateY(.6em);opacity:0;animation:rb-rise .6s cubic-bezier(.2,.8,.2,1) forwards}
.rb-split span:nth-child(1){animation-delay:.00s}.rb-split span:nth-child(2){animation-delay:.05s}
.rb-split span:nth-child(3){animation-delay:.10s}.rb-split span:nth-child(4){animation-delay:.15s}
.rb-split span:nth-child(5){animation-delay:.20s}.rb-split span:nth-child(6){animation-delay:.25s}
.rb-split span:nth-child(7){animation-delay:.30s}.rb-split span:nth-child(8){animation-delay:.35s}
.rb-split span:nth-child(9){animation-delay:.40s}.rb-split span:nth-child(10){animation-delay:.45s}
@keyframes rb-rise{to{transform:none;opacity:1}}
</style>`,
  },
  {
    id: "text-type",
    name: "Text Type",
    category: "Text",
    hint: "Typewriter reveal with a blinking caret",
    html: `<h2 class="rb-type">Typed on arrival</h2>
<style>
.rb-type{font:600 clamp(20px,3.4vw,34px)/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0 0 12px;color:#e6edf3;
  width:max-content;max-width:100%;overflow:hidden;white-space:nowrap;
  border-right:2px solid #3f8e84;
  animation:rb-type 2.6s steps(24,end) forwards,rb-caret .8s step-end infinite}
@keyframes rb-type{from{width:0}to{width:max-content}}
@keyframes rb-caret{50%{border-color:transparent}}
</style>`,
  },
  {
    id: "falling-text",
    name: "Falling Text",
    category: "Text",
    hint: "Letters dropping in from above",
    html: `<h2 class="rb-fall"><span>F</span><span>a</span><span>l</span><span>l</span><span>i</span><span>n</span><span>g</span></h2>
<style>
.rb-fall{font:800 clamp(28px,5vw,52px)/1.1 system-ui,sans-serif;margin:0 0 12px;color:#e6edf3}
.rb-fall span{display:inline-block;transform:translateY(-120%);opacity:0;animation:rb-drop .7s cubic-bezier(.3,1.4,.5,1) forwards}
.rb-fall span:nth-child(2){animation-delay:.08s}.rb-fall span:nth-child(3){animation-delay:.16s}
.rb-fall span:nth-child(4){animation-delay:.24s}.rb-fall span:nth-child(5){animation-delay:.32s}
.rb-fall span:nth-child(6){animation-delay:.40s}.rb-fall span:nth-child(7){animation-delay:.48s}
@keyframes rb-drop{to{transform:none;opacity:1}}
</style>`,
  },
  {
    id: "circular-text",
    name: "Circular Text",
    category: "Text",
    hint: "Words set around a slowly rotating ring",
    html: `<div class="rb-circ"><span>F</span><span>1</span><span>&nbsp;</span><span>M</span><span>E</span><span>D</span><span>I</span><span>A</span><span>&nbsp;</span><span>&bull;</span><span>&nbsp;</span><span>T</span><span>E</span><span>A</span><span>M</span><span>&nbsp;</span><span>&bull;</span></div>
<style>
.rb-circ{position:relative;width:180px;height:180px;margin:16px auto;animation:rb-spin 14s linear infinite;font:600 14px/1 ui-monospace,monospace;color:#3f8e84}
.rb-circ span{position:absolute;left:50%;top:0;height:90px;transform-origin:bottom center}
.rb-circ span:nth-child(1){transform:rotate(0deg)}.rb-circ span:nth-child(2){transform:rotate(21deg)}
.rb-circ span:nth-child(3){transform:rotate(42deg)}.rb-circ span:nth-child(4){transform:rotate(63deg)}
.rb-circ span:nth-child(5){transform:rotate(84deg)}.rb-circ span:nth-child(6){transform:rotate(105deg)}
.rb-circ span:nth-child(7){transform:rotate(126deg)}.rb-circ span:nth-child(8){transform:rotate(147deg)}
.rb-circ span:nth-child(9){transform:rotate(168deg)}.rb-circ span:nth-child(10){transform:rotate(189deg)}
.rb-circ span:nth-child(11){transform:rotate(210deg)}.rb-circ span:nth-child(12){transform:rotate(231deg)}
.rb-circ span:nth-child(13){transform:rotate(252deg)}.rb-circ span:nth-child(14){transform:rotate(273deg)}
.rb-circ span:nth-child(15){transform:rotate(294deg)}.rb-circ span:nth-child(16){transform:rotate(315deg)}
.rb-circ span:nth-child(17){transform:rotate(336deg)}
@keyframes rb-spin{to{transform:rotate(360deg)}}
</style>`,
  },
  {
    id: "scroll-reveal",
    name: "Scroll Reveal",
    category: "Text",
    hint: "Paragraph that fades up as it enters view",
    html: `<p class="rb-reveal">This paragraph eases up into place when it scrolls into view, then stays put.</p>
<style>
.rb-reveal{font:400 18px/1.7 system-ui,sans-serif;color:#c3ccd6;max-width:60ch;margin:0 0 16px;
  animation:rb-reveal-in linear both;animation-timeline:view();animation-range:entry 10% cover 35%}
@keyframes rb-reveal-in{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
@supports not (animation-timeline:view()){.rb-reveal{opacity:1;transform:none}}
</style>`,
  },

  // ------------------------------------------------------------------
  // Animations
  // ------------------------------------------------------------------
  {
    id: "star-border",
    name: "Star Border",
    category: "Animations",
    hint: "Button with light travelling around the edge",
    html: `<a href="#" class="rb-star">Get started</a>
<style>
.rb-star{position:relative;display:inline-block;padding:14px 28px;border-radius:999px;
  font:600 15px/1 system-ui,sans-serif;color:#e6edf3;text-decoration:none;background:#12181f;isolation:isolate}
.rb-star::before{content:"";position:absolute;inset:-2px;border-radius:inherit;z-index:-1;
  background:conic-gradient(from 0deg,transparent 0 78%,#3f8e84 88%,#8ef0dc 94%,transparent 100%);
  animation:rb-orbit 3s linear infinite}
.rb-star::after{content:"";position:absolute;inset:0;border-radius:inherit;background:#12181f;z-index:-1}
@keyframes rb-orbit{to{transform:rotate(1turn)}}
</style>`,
  },
  {
    id: "electric-border",
    name: "Electric Border",
    category: "Animations",
    hint: "Card with a charged, shifting outline",
    html: `<div class="rb-electric"><h3>Electric border</h3><p>A charged outline that keeps moving.</p></div>
<style>
.rb-electric{position:relative;padding:26px;border-radius:16px;background:#0f1620;color:#e6edf3;
  font:400 15px/1.6 system-ui,sans-serif;max-width:420px;isolation:isolate}
.rb-electric h3{margin:0 0 8px;font-size:19px}
.rb-electric p{margin:0;color:#9fb0c0}
.rb-electric::before{content:"";position:absolute;inset:-1.5px;border-radius:inherit;z-index:-1;
  background:linear-gradient(120deg,#3f8e84,#7ce7ff,#a78bfa,#3f8e84);background-size:300% 300%;
  animation:rb-electric-pan 4.5s ease infinite;filter:blur(.4px)}
@keyframes rb-electric-pan{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
</style>`,
  },
  {
    id: "glare-hover",
    name: "Glare Hover",
    category: "Animations",
    hint: "Sheen that sweeps across on hover",
    html: `<div class="rb-glare"><h3>Hover me</h3><p>A sheen crosses the surface.</p></div>
<style>
.rb-glare{position:relative;overflow:hidden;padding:28px;border-radius:14px;max-width:420px;
  background:#141c25;color:#e6edf3;font:400 15px/1.6 system-ui,sans-serif;border:1px solid #27333f}
.rb-glare h3{margin:0 0 8px;font-size:19px}
.rb-glare p{margin:0;color:#9fb0c0}
.rb-glare::after{content:"";position:absolute;top:-60%;left:-70%;width:45%;height:220%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent);
  transform:rotate(18deg);transition:left .65s cubic-bezier(.2,.7,.3,1)}
.rb-glare:hover::after{left:130%}
</style>`,
  },
  {
    id: "gradual-blur",
    name: "Gradual Blur",
    category: "Animations",
    hint: "Progressive blur fading out a section edge",
    html: `<div class="rb-gblur"><p>Content scrolls under a soft, progressively blurred edge — useful at the bottom of a scrolling panel.</p><div class="rb-gblur-veil"></div></div>
<style>
.rb-gblur{position:relative;padding:24px;border-radius:14px;background:#111922;color:#c3ccd6;
  font:400 15px/1.7 system-ui,sans-serif;max-width:520px;overflow:hidden}
.rb-gblur p{margin:0}
.rb-gblur-veil{position:absolute;left:0;right:0;bottom:0;height:70px;pointer-events:none;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  mask-image:linear-gradient(to top,#000 0%,transparent 100%);
  -webkit-mask-image:linear-gradient(to top,#000 0%,transparent 100%)}
</style>`,
  },
  {
    id: "fade-content",
    name: "Fade Content",
    category: "Animations",
    hint: "Section that fades and lifts on entry",
    html: `<section class="rb-fade"><h3>Fade content</h3><p>Eases in on load, and again whenever it re-enters the viewport.</p></section>
<style>
.rb-fade{padding:26px;border-radius:14px;background:#141c25;border:1px solid #27333f;max-width:520px;
  color:#e6edf3;font:400 15px/1.7 system-ui,sans-serif;
  animation:rb-fade-in .8s cubic-bezier(.2,.7,.3,1) both}
.rb-fade h3{margin:0 0 8px;font-size:19px}
.rb-fade p{margin:0;color:#9fb0c0}
@keyframes rb-fade-in{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
</style>`,
  },
  {
    id: "noise",
    name: "Noise",
    category: "Animations",
    hint: "Film-grain texture overlay",
    html: `<div class="rb-noise"><h3>Grain overlay</h3><p>A fine static texture sitting over the surface.</p></div>
<style>
.rb-noise{position:relative;overflow:hidden;padding:28px;border-radius:14px;max-width:480px;
  background:linear-gradient(135deg,#1b2733,#0f1620);color:#e6edf3;font:400 15px/1.6 system-ui,sans-serif}
.rb-noise h3{margin:0 0 8px;font-size:19px}
.rb-noise p{margin:0;color:#9fb0c0}
.rb-noise::after{content:"";position:absolute;inset:-50%;pointer-events:none;opacity:.5;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/><feColorMatrix type='saturate' values='0'/></filter><rect width='120' height='120' filter='url(%23n)' opacity='.35'/></svg>");
  animation:rb-noise-shift .6s steps(3) infinite}
@keyframes rb-noise-shift{0%{transform:translate(0,0)}33%{transform:translate(-3%,2%)}66%{transform:translate(2%,-2%)}}
</style>`,
  },
  {
    id: "animated-list",
    name: "Animated List",
    category: "Animations",
    hint: "List whose rows cascade in",
    html: `<ul class="rb-alist"><li>First item</li><li>Second item</li><li>Third item</li><li>Fourth item</li></ul>
<style>
.rb-alist{list-style:none;margin:0 0 16px;padding:0;max-width:420px;font:400 15px/1 system-ui,sans-serif}
.rb-alist li{padding:14px 16px;margin-bottom:8px;border-radius:10px;background:#141c25;border:1px solid #27333f;
  color:#e6edf3;opacity:0;transform:translateX(-14px);animation:rb-slide-in .5s cubic-bezier(.2,.8,.2,1) forwards}
.rb-alist li:nth-child(2){animation-delay:.09s}.rb-alist li:nth-child(3){animation-delay:.18s}
.rb-alist li:nth-child(4){animation-delay:.27s}
.rb-alist li:hover{border-color:#3f8e84;transform:translateX(4px);transition:transform .2s,border-color .2s}
@keyframes rb-slide-in{to{opacity:1;transform:none}}
</style>`,
  },

  // ------------------------------------------------------------------
  // Components
  // ------------------------------------------------------------------
  {
    id: "spotlight-card",
    name: "Spotlight Card",
    category: "Components",
    hint: "Card lit by a soft radial highlight",
    html: `<div class="rb-spot"><h3>Spotlight card</h3><p>A soft light pooled in the corner, brightening on hover.</p></div>
<style>
.rb-spot{position:relative;overflow:hidden;padding:30px;border-radius:16px;max-width:420px;
  background:#0f1620;border:1px solid #27333f;color:#e6edf3;font:400 15px/1.65 system-ui,sans-serif;
  transition:border-color .25s}
.rb-spot h3{margin:0 0 8px;font-size:20px}
.rb-spot p{margin:0;color:#9fb0c0}
.rb-spot::before{content:"";position:absolute;top:-40%;left:-10%;width:70%;height:140%;pointer-events:none;
  background:radial-gradient(closest-side,rgba(63,142,132,.30),transparent);transition:opacity .3s;opacity:.75}
.rb-spot:hover{border-color:#3f8e84}
.rb-spot:hover::before{opacity:1}
</style>`,
  },
  {
    id: "tilted-card",
    name: "Tilted Card",
    category: "Components",
    hint: "Card that tips in 3D on hover",
    html: `<div class="rb-tilt-wrap"><div class="rb-tilt"><h3>Tilted card</h3><p>Leans toward you on hover.</p></div></div>
<style>
.rb-tilt-wrap{perspective:900px;display:inline-block}
.rb-tilt{padding:30px;border-radius:16px;max-width:340px;background:linear-gradient(150deg,#1b2733,#0f1620);
  border:1px solid #27333f;color:#e6edf3;font:400 15px/1.6 system-ui,sans-serif;
  transition:transform .35s cubic-bezier(.2,.7,.3,1),box-shadow .35s;transform-style:preserve-3d}
.rb-tilt h3{margin:0 0 8px;font-size:20px}
.rb-tilt p{margin:0;color:#9fb0c0}
.rb-tilt:hover{transform:rotateX(8deg) rotateY(-10deg) translateY(-4px);box-shadow:0 24px 48px -18px rgba(0,0,0,.7)}
</style>`,
  },
  {
    id: "border-glow",
    name: "Border Glow",
    category: "Components",
    hint: "Panel with a glow that follows the frame",
    html: `<div class="rb-bglow"><h3>Border glow</h3><p>A rotating light held just inside the frame.</p></div>
<style>
.rb-bglow{position:relative;padding:28px;border-radius:16px;max-width:420px;background:#0f1620;color:#e6edf3;
  font:400 15px/1.6 system-ui,sans-serif;isolation:isolate}
.rb-bglow h3{margin:0 0 8px;font-size:20px}
.rb-bglow p{margin:0;color:#9fb0c0}
.rb-bglow::before{content:"";position:absolute;inset:-1px;border-radius:inherit;z-index:-1;
  background:conic-gradient(from 0deg,#3f8e84,#7ce7ff,#a78bfa,#3f8e84);animation:rb-bglow-spin 6s linear infinite}
.rb-bglow::after{content:"";position:absolute;inset:0;border-radius:inherit;background:#0f1620;z-index:-1}
@keyframes rb-bglow-spin{to{transform:rotate(1turn)}}
</style>`,
  },
  {
    id: "bounce-cards",
    name: "Bounce Cards",
    category: "Components",
    hint: "Row of cards that spring up individually",
    html: `<div class="rb-bounce"><div>One</div><div>Two</div><div>Three</div></div>
<style>
.rb-bounce{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 16px}
.rb-bounce div{flex:1 1 140px;padding:26px 18px;border-radius:14px;text-align:center;
  background:#141c25;border:1px solid #27333f;color:#e6edf3;font:600 15px/1 system-ui,sans-serif;
  animation:rb-bounce-in .6s cubic-bezier(.3,1.5,.5,1) both;transition:transform .2s}
.rb-bounce div:nth-child(2){animation-delay:.1s}.rb-bounce div:nth-child(3){animation-delay:.2s}
.rb-bounce div:hover{transform:translateY(-6px)}
@keyframes rb-bounce-in{from{opacity:0;transform:scale(.85) translateY(18px)}to{opacity:1;transform:none}}
</style>`,
  },
  {
    id: "pill-nav",
    name: "Pill Nav",
    category: "Components",
    hint: "Rounded navigation bar with an active pill",
    html: `<nav class="rb-pillnav"><a href="#" class="is-active">Home</a><a href="#">Work</a><a href="#">About</a><a href="#">Contact</a></nav>
<style>
.rb-pillnav{display:inline-flex;gap:4px;padding:5px;border-radius:999px;background:#141c25;border:1px solid #27333f;margin:0 0 16px}
.rb-pillnav a{padding:9px 18px;border-radius:999px;text-decoration:none;color:#9fb0c0;
  font:600 14px/1 system-ui,sans-serif;transition:background .2s,color .2s}
.rb-pillnav a:hover{color:#e6edf3;background:#1d2731}
.rb-pillnav a.is-active{background:#3f8e84;color:#fff}
</style>`,
  },
  {
    id: "dock",
    name: "Dock",
    category: "Components",
    hint: "macOS-style dock that magnifies on hover",
    html: `<div class="rb-dock"><span>◆</span><span>●</span><span>▲</span><span>■</span><span>★</span></div>
<style>
.rb-dock{display:inline-flex;align-items:flex-end;gap:10px;padding:10px 14px;border-radius:18px;
  background:rgba(20,28,37,.85);border:1px solid #27333f;backdrop-filter:blur(8px);margin:0 0 16px}
.rb-dock span{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;
  background:#1d2731;color:#8ef0dc;font-size:18px;transition:transform .18s cubic-bezier(.2,.8,.2,1),background .18s;
  transform-origin:bottom center;cursor:pointer}
.rb-dock span:hover{transform:scale(1.45) translateY(-6px);background:#264034}
</style>`,
  },
  {
    id: "stepper",
    name: "Stepper",
    category: "Components",
    hint: "Numbered progress steps with a connector",
    html: `<ol class="rb-stepper"><li class="is-done"><span>1</span>Brief</li><li class="is-done"><span>2</span>Draft</li><li class="is-current"><span>3</span>Review</li><li><span>4</span>Publish</li></ol>
<style>
.rb-stepper{list-style:none;display:flex;gap:0;margin:0 0 16px;padding:0;font:600 13px/1 system-ui,sans-serif;flex-wrap:wrap}
.rb-stepper li{position:relative;flex:1 1 110px;display:flex;flex-direction:column;align-items:center;gap:8px;color:#6d8091;text-align:center}
.rb-stepper li::before{content:"";position:absolute;top:16px;left:-50%;width:100%;height:2px;background:#27333f;z-index:0}
.rb-stepper li:first-child::before{display:none}
.rb-stepper li span{position:relative;z-index:1;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;
  background:#141c25;border:2px solid #27333f;color:#6d8091}
.rb-stepper .is-done{color:#8ef0dc}.rb-stepper .is-done span{background:#3f8e84;border-color:#3f8e84;color:#fff}
.rb-stepper .is-done::before{background:#3f8e84}
.rb-stepper .is-current{color:#e6edf3}.rb-stepper .is-current span{border-color:#3f8e84;color:#8ef0dc}
</style>`,
  },
  {
    id: "masonry",
    name: "Masonry",
    category: "Components",
    hint: "Staggered multi-column layout",
    html: `<div class="rb-masonry"><div style="height:120px">One</div><div style="height:180px">Two</div><div style="height:90px">Three</div><div style="height:150px">Four</div><div style="height:110px">Five</div><div style="height:160px">Six</div></div>
<style>
.rb-masonry{columns:3 200px;column-gap:14px;margin:0 0 16px}
.rb-masonry div{break-inside:avoid;margin-bottom:14px;padding:16px;border-radius:12px;display:flex;align-items:flex-end;
  background:linear-gradient(160deg,#1b2733,#111922);border:1px solid #27333f;color:#e6edf3;font:600 14px/1 system-ui,sans-serif}
</style>`,
  },
  {
    id: "glass-surface",
    name: "Glass Surface",
    category: "Components",
    hint: "Frosted panel over whatever sits behind it",
    html: `<div class="rb-glass"><h3>Glass surface</h3><p>Frosted, translucent, and slightly lifted.</p></div>
<style>
.rb-glass{padding:28px;border-radius:18px;max-width:420px;color:#f1f5f9;font:400 15px/1.6 system-ui,sans-serif;
  background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);
  backdrop-filter:blur(14px) saturate(150%);-webkit-backdrop-filter:blur(14px) saturate(150%);
  box-shadow:0 18px 40px -20px rgba(0,0,0,.65)}
.rb-glass h3{margin:0 0 8px;font-size:20px}
.rb-glass p{margin:0;opacity:.85}
</style>`,
  },
  {
    id: "profile-card",
    name: "Profile Card",
    category: "Components",
    hint: "Avatar, name, role, and action",
    html: `<div class="rb-profile"><div class="rb-profile-av">FM</div><h3>Jordan Ellis</h3><p>Account Director</p><a href="#">Get in touch</a></div>
<style>
.rb-profile{width:260px;padding:28px 22px;border-radius:18px;text-align:center;
  background:linear-gradient(170deg,#1b2733,#0f1620);border:1px solid #27333f;color:#e6edf3;
  font:400 14px/1.5 system-ui,sans-serif;margin:0 0 16px}
.rb-profile-av{width:72px;height:72px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;
  background:linear-gradient(135deg,#3f8e84,#7ce7ff);color:#08121a;font:700 22px/1 system-ui,sans-serif}
.rb-profile h3{margin:0 0 4px;font-size:18px}
.rb-profile p{margin:0 0 16px;color:#9fb0c0}
.rb-profile a{display:inline-block;padding:9px 18px;border-radius:999px;background:#3f8e84;color:#fff;
  text-decoration:none;font-weight:600;transition:filter .2s}
.rb-profile a:hover{filter:brightness(1.1)}
</style>`,
  },
  {
    id: "carousel",
    name: "Carousel",
    category: "Components",
    hint: "Swipeable scroll-snap row, no JS",
    html: `<div class="rb-carousel"><div>Slide one</div><div>Slide two</div><div>Slide three</div><div>Slide four</div></div>
<style>
.rb-carousel{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:10px;margin:0 0 16px;
  scrollbar-width:thin}
.rb-carousel div{flex:0 0 260px;height:150px;scroll-snap-align:center;border-radius:14px;display:grid;place-items:center;
  background:linear-gradient(150deg,#1b2733,#111922);border:1px solid #27333f;color:#e6edf3;font:600 15px/1 system-ui,sans-serif}
</style>`,
  },
  {
    id: "magic-bento",
    name: "Magic Bento",
    category: "Components",
    hint: "Asymmetric bento grid of panels",
    html: `<div class="rb-bento"><div class="rb-bento-lg">Featured</div><div>Two</div><div>Three</div><div class="rb-bento-wide">Wide panel</div></div>
<style>
.rb-bento{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:0 0 16px}
.rb-bento div{min-height:110px;padding:18px;border-radius:14px;display:flex;align-items:flex-end;
  background:linear-gradient(150deg,#1b2733,#111922);border:1px solid #27333f;color:#e6edf3;
  font:600 15px/1 system-ui,sans-serif;transition:border-color .2s,transform .2s}
.rb-bento div:hover{border-color:#3f8e84;transform:translateY(-3px)}
.rb-bento-lg{grid-row:span 2;min-height:236px!important}
.rb-bento-wide{grid-column:span 2}
</style>`,
  },
  {
    id: "counter",
    name: "Counter",
    category: "Components",
    hint: "Big stat figures with labels",
    html: `<div class="rb-counter"><div><strong>135</strong><span>Components</span></div><div><strong>4</strong><span>Categories</span></div><div><strong>98%</strong><span>Satisfaction</span></div></div>
<style>
.rb-counter{display:flex;gap:32px;flex-wrap:wrap;margin:0 0 16px;font-family:system-ui,sans-serif}
.rb-counter div{display:flex;flex-direction:column;gap:4px}
.rb-counter strong{font-size:38px;line-height:1;font-weight:700;
  background:linear-gradient(120deg,#3f8e84,#7ce7ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.rb-counter span{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6d8091}
</style>`,
  },

  // ------------------------------------------------------------------
  // Backgrounds
  // ------------------------------------------------------------------
  {
    id: "aurora",
    name: "Aurora",
    category: "Backgrounds",
    hint: "Drifting aurora wash",
    html: `<div class="rb-aurora"><h2>Aurora</h2><p>Soft light drifting behind the content.</p></div>
<style>
.rb-aurora{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;
  background:#070d14;color:#e6edf3;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-aurora h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-aurora p{position:relative;z-index:1;margin:0;color:#a8b8c7}
.rb-aurora::before{content:"";position:absolute;inset:-40%;
  background:
    radial-gradient(40% 40% at 30% 35%,rgba(63,142,132,.55),transparent 70%),
    radial-gradient(35% 45% at 70% 55%,rgba(124,231,255,.40),transparent 70%),
    radial-gradient(45% 35% at 55% 20%,rgba(167,139,250,.35),transparent 70%);
  filter:blur(42px);animation:rb-aurora-drift 16s ease-in-out infinite alternate}
@keyframes rb-aurora-drift{from{transform:translate3d(-4%,-3%,0) scale(1)}to{transform:translate3d(5%,4%,0) scale(1.12)}}
</style>`,
  },
  {
    id: "dot-grid",
    name: "Dot Grid",
    category: "Backgrounds",
    hint: "Precise dot lattice",
    html: `<div class="rb-dotgrid"><h2>Dot grid</h2><p>A quiet lattice behind the content.</p></div>
<style>
.rb-dotgrid{position:relative;padding:64px 32px;border-radius:18px;text-align:center;background:#0b1119;color:#e6edf3;
  font-family:system-ui,sans-serif;margin:0 0 16px;
  background-image:radial-gradient(rgba(63,142,132,.45) 1.2px,transparent 1.2px);background-size:22px 22px}
.rb-dotgrid h2{margin:0 0 8px;font-size:32px}
.rb-dotgrid p{margin:0;color:#a8b8c7}
</style>`,
  },
  {
    id: "grid-motion",
    name: "Grid Motion",
    category: "Backgrounds",
    hint: "Perspective grid sliding toward you",
    html: `<div class="rb-gridmotion"><h2>Grid motion</h2><p>A horizon grid in perpetual motion.</p></div>
<style>
.rb-gridmotion{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;
  background:linear-gradient(#070d14,#0d1a24);color:#e6edf3;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-gridmotion h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-gridmotion p{position:relative;z-index:1;margin:0;color:#a8b8c7}
.rb-gridmotion::before{content:"";position:absolute;inset:auto 0 -10% 0;height:120%;
  background-image:linear-gradient(rgba(63,142,132,.35) 1px,transparent 1px),
                   linear-gradient(90deg,rgba(63,142,132,.28) 1px,transparent 1px);
  background-size:44px 44px;transform:perspective(320px) rotateX(62deg);transform-origin:bottom center;
  animation:rb-grid-run 2.6s linear infinite;mask-image:linear-gradient(to top,#000,transparent 72%);
  -webkit-mask-image:linear-gradient(to top,#000,transparent 72%)}
@keyframes rb-grid-run{to{background-position:0 44px,0 0}}
</style>`,
  },
  {
    id: "beams",
    name: "Beams",
    category: "Backgrounds",
    hint: "Angled light beams sweeping across",
    html: `<div class="rb-beams"><h2>Beams</h2><p>Angled light crossing the frame.</p></div>
<style>
.rb-beams{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;background:#070d14;
  color:#e6edf3;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-beams h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-beams p{position:relative;z-index:1;margin:0;color:#a8b8c7}
.rb-beams::before{content:"";position:absolute;inset:-50%;
  background:repeating-linear-gradient(70deg,transparent 0 60px,rgba(124,231,255,.09) 60px 66px,transparent 66px 130px);
  animation:rb-beams-slide 9s linear infinite}
@keyframes rb-beams-slide{to{transform:translateX(-130px)}}
</style>`,
  },
  {
    id: "waves",
    name: "Waves",
    category: "Backgrounds",
    hint: "Layered waves rolling underneath",
    html: `<div class="rb-waves"><h2>Waves</h2><p>Layered swells moving at different speeds.</p></div>
<style>
.rb-waves{position:relative;overflow:hidden;padding:64px 32px 84px;border-radius:18px;text-align:center;
  background:linear-gradient(#08131b,#0d2029);color:#e6edf3;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-waves h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-waves p{position:relative;z-index:1;margin:0;color:#a8b8c7}
.rb-waves::before,.rb-waves::after{content:"";position:absolute;left:-50%;width:200%;height:200px;bottom:-90px;
  border-radius:44%;background:rgba(63,142,132,.30);animation:rb-wave-spin 12s linear infinite}
.rb-waves::after{background:rgba(124,231,255,.18);animation-duration:18s;bottom:-110px}
@keyframes rb-wave-spin{to{transform:rotate(360deg)}}
</style>`,
  },
  {
    id: "silk",
    name: "Silk",
    category: "Backgrounds",
    hint: "Slow, silky colour folds",
    html: `<div class="rb-silk"><h2>Silk</h2><p>Colour folding slowly over itself.</p></div>
<style>
.rb-silk{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;color:#f2f7fb;
  font-family:system-ui,sans-serif;margin:0 0 16px;
  background:linear-gradient(115deg,#123,#1b4d54,#2b6f6a,#1b3a5c,#123);background-size:320% 320%;
  animation:rb-silk-flow 18s ease-in-out infinite}
.rb-silk h2{margin:0 0 8px;font-size:32px}
.rb-silk p{margin:0;opacity:.82}
@keyframes rb-silk-flow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
</style>`,
  },
  {
    id: "threads",
    name: "Threads",
    category: "Backgrounds",
    hint: "Fine vertical threads drifting",
    html: `<div class="rb-threads"><h2>Threads</h2><p>Thin vertical lines in slow motion.</p></div>
<style>
.rb-threads{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;background:#080f16;
  color:#e6edf3;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-threads h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-threads p{position:relative;z-index:1;margin:0;color:#a8b8c7}
.rb-threads::before{content:"";position:absolute;inset:-20% 0;
  background:repeating-linear-gradient(90deg,transparent 0 26px,rgba(63,142,132,.30) 26px 27px);
  animation:rb-threads-drift 7s ease-in-out infinite alternate;
  mask-image:radial-gradient(70% 70% at 50% 50%,#000,transparent);
  -webkit-mask-image:radial-gradient(70% 70% at 50% 50%,#000,transparent)}
@keyframes rb-threads-drift{from{transform:translateX(-14px) skewX(-2deg)}to{transform:translateX(14px) skewX(2deg)}}
</style>`,
  },
  {
    id: "iridescence",
    name: "Iridescence",
    category: "Backgrounds",
    hint: "Oil-slick colour shift",
    html: `<div class="rb-irid"><h2>Iridescence</h2><p>Colour shifting like an oil slick.</p></div>
<style>
.rb-irid{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;color:#0b1119;
  font-family:system-ui,sans-serif;margin:0 0 16px;
  background:conic-gradient(from 180deg at 50% 50%,#a78bfa,#7ce7ff,#8ef0dc,#ffd6a5,#ffa5c3,#a78bfa);
  background-size:200% 200%;animation:rb-irid-turn 14s ease-in-out infinite}
.rb-irid h2{margin:0 0 8px;font-size:32px;font-weight:800}
.rb-irid p{margin:0;opacity:.75}
@keyframes rb-irid-turn{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
</style>`,
  },
  {
    id: "light-rays",
    name: "Light Rays",
    category: "Backgrounds",
    hint: "Rays fanning from a single point",
    html: `<div class="rb-rays"><h2>Light rays</h2><p>A source above, fanning down.</p></div>
<style>
.rb-rays{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;background:#060b12;
  color:#e6edf3;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-rays h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-rays p{position:relative;z-index:1;margin:0;color:#a8b8c7}
.rb-rays::before{content:"";position:absolute;top:-60%;left:50%;width:180%;height:180%;translate:-50% 0;
  background:conic-gradient(from 200deg at 50% 0%,transparent 0 6deg,rgba(124,231,255,.16) 8deg 10deg,transparent 12deg 20deg,rgba(63,142,132,.18) 22deg 25deg,transparent 27deg 40deg);
  animation:rb-rays-sweep 11s ease-in-out infinite alternate;transform-origin:top center}
@keyframes rb-rays-sweep{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
</style>`,
  },
  {
    id: "plasma",
    name: "Plasma",
    category: "Backgrounds",
    hint: "Roiling plasma blobs",
    html: `<div class="rb-plasma"><h2>Plasma</h2><p>Heat moving under the surface.</p></div>
<style>
.rb-plasma{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;background:#0a0713;
  color:#f4ecff;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-plasma h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-plasma p{position:relative;z-index:1;margin:0;opacity:.8}
.rb-plasma::before{content:"";position:absolute;inset:-45%;filter:blur(38px);
  background:
    radial-gradient(28% 28% at 30% 40%,#ff4d9d,transparent 70%),
    radial-gradient(26% 26% at 68% 34%,#7c4dff,transparent 70%),
    radial-gradient(30% 30% at 50% 72%,#00d4ff,transparent 70%);
  animation:rb-plasma-churn 13s ease-in-out infinite alternate}
@keyframes rb-plasma-churn{from{transform:rotate(-8deg) scale(1)}to{transform:rotate(10deg) scale(1.18)}}
</style>`,
  },
  {
    id: "grainient",
    name: "Grainient",
    category: "Backgrounds",
    hint: "Gradient with grain over it",
    html: `<div class="rb-grainient"><h2>Grainient</h2><p>A gradient, roughened up.</p></div>
<style>
.rb-grainient{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;
  background:linear-gradient(135deg,#3f8e84,#1b3a5c 55%,#2b1b4d);color:#f2f7fb;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-grainient h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-grainient p{position:relative;z-index:1;margin:0;opacity:.82}
.rb-grainient::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.42;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4'/><feColorMatrix type='saturate' values='0'/></filter><rect width='140' height='140' filter='url(%23g)' opacity='.4'/></svg>")}
</style>`,
  },
  {
    id: "ripple-grid",
    name: "Ripple Grid",
    category: "Backgrounds",
    hint: "Grid pulsing out from the centre",
    html: `<div class="rb-ripple"><h2>Ripple grid</h2><p>A pulse travelling through the mesh.</p></div>
<style>
.rb-ripple{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;background:#080f16;
  color:#e6edf3;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-ripple h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-ripple p{position:relative;z-index:1;margin:0;color:#a8b8c7}
.rb-ripple::before{content:"";position:absolute;inset:0;
  background-image:linear-gradient(rgba(63,142,132,.30) 1px,transparent 1px),
                   linear-gradient(90deg,rgba(63,142,132,.30) 1px,transparent 1px);
  background-size:30px 30px;
  mask-image:radial-gradient(circle at 50% 50%,#000 0%,transparent 60%);
  -webkit-mask-image:radial-gradient(circle at 50% 50%,#000 0%,transparent 60%);
  animation:rb-ripple-pulse 4.5s ease-in-out infinite}
@keyframes rb-ripple-pulse{0%,100%{mask-size:60% 60%;-webkit-mask-size:60% 60%}50%{mask-size:160% 160%;-webkit-mask-size:160% 160%}}
</style>`,
  },
  {
    id: "pixel-snow",
    name: "Pixel Snow",
    category: "Backgrounds",
    hint: "Pixel flecks drifting downward",
    html: `<div class="rb-snow"><h2>Pixel snow</h2><p>Flecks drifting down the frame.</p></div>
<style>
.rb-snow{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;background:#070d14;
  color:#e6edf3;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-snow h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-snow p{position:relative;z-index:1;margin:0;color:#a8b8c7}
.rb-snow::before,.rb-snow::after{content:"";position:absolute;inset:-100% 0 0 0;height:200%;
  background-image:radial-gradient(#fff 1px,transparent 1px);background-size:38px 38px;opacity:.30;
  animation:rb-snow-fall 9s linear infinite}
.rb-snow::after{background-size:64px 64px;opacity:.18;animation-duration:15s}
@keyframes rb-snow-fall{to{transform:translateY(50%)}}
</style>`,
  },
  {
    id: "soft-aurora",
    name: "Soft Aurora",
    category: "Backgrounds",
    hint: "Pale aurora for light-themed pages",
    html: `<div class="rb-softaurora"><h2>Soft aurora</h2><p>The same idea, tuned for a light page.</p></div>
<style>
.rb-softaurora{position:relative;overflow:hidden;padding:64px 32px;border-radius:18px;text-align:center;
  background:#f6f9fb;color:#16202a;font-family:system-ui,sans-serif;margin:0 0 16px}
.rb-softaurora h2{position:relative;z-index:1;margin:0 0 8px;font-size:32px}
.rb-softaurora p{position:relative;z-index:1;margin:0;color:#5d6e7c}
.rb-softaurora::before{content:"";position:absolute;inset:-40%;filter:blur(46px);
  background:
    radial-gradient(38% 38% at 28% 34%,rgba(63,142,132,.38),transparent 70%),
    radial-gradient(34% 42% at 72% 58%,rgba(124,180,255,.34),transparent 70%),
    radial-gradient(40% 34% at 54% 22%,rgba(255,182,193,.32),transparent 70%);
  animation:rb-soft-drift 18s ease-in-out infinite alternate}
@keyframes rb-soft-drift{from{transform:translate3d(-4%,-3%,0)}to{transform:translate3d(5%,4%,0) scale(1.1)}}
</style>`,
  },

  // ------------------------------------------------------------------
  // Plain building blocks — the everyday "fix this page" pieces
  // ------------------------------------------------------------------
  {
    id: "section-two-col",
    name: "Two columns",
    category: "Components",
    hint: "Responsive two-column section",
    html: `<section class="rb-2col"><div><h3>Left column</h3><p>Collapses to a single column on narrow screens.</p></div><div><h3>Right column</h3><p>Equal width, with a gap between them.</p></div></section>
<style>
.rb-2col{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;margin:0 0 16px;
  font:400 15px/1.65 system-ui,sans-serif;color:#c3ccd6}
.rb-2col h3{margin:0 0 8px;font-size:19px;color:#e6edf3}
.rb-2col p{margin:0}
</style>`,
  },
  {
    id: "button-row",
    name: "Button pair",
    category: "Components",
    hint: "Primary + secondary call to action",
    html: `<div class="rb-btnrow"><a href="#" class="rb-btn-primary">Get started</a><a href="#" class="rb-btn-ghost">Learn more</a></div>
<style>
.rb-btnrow{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 16px;font-family:system-ui,sans-serif}
.rb-btn-primary,.rb-btn-ghost{padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;transition:.2s}
.rb-btn-primary{background:#3f8e84;color:#fff}
.rb-btn-primary:hover{filter:brightness(1.1)}
.rb-btn-ghost{border:1px solid #27333f;color:#c3ccd6}
.rb-btn-ghost:hover{border-color:#3f8e84;color:#e6edf3}
</style>`,
  },
  {
    id: "divider",
    name: "Divider",
    category: "Components",
    hint: "Fading horizontal rule",
    html: `<hr class="rb-divider">
<style>
.rb-divider{border:0;height:1px;margin:28px 0;background:linear-gradient(90deg,transparent,#3f8e84,transparent)}
</style>`,
  },
];

export function blocksByCategory(category: BlockCategory): HtmlBlock[] {
  return HTML_BLOCKS.filter((b) => b.category === category);
}
