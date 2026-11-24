/**
 * A short word list for share passphrases: exactly 256 words, so one
 * `crypto.getRandomValues` byte picks a word with no modulo bias and six
 * words carry 48 bits. Short, common, unambiguous words — the passphrase is
 * meant to be typed over (from another chat, ideally), not dictated.
 */
export const SHARE_WORDS: readonly string[] = [
  "acorn", "agate", "album", "amber", "anchor", "angle", "ankle", "apple",
  "april", "ashen", "aspen", "atlas", "atomic", "auburn", "aurora", "autumn",
  "avenue", "azure", "bagel", "baker", "balcony", "bamboo", "banjo", "barn",
  "basalt", "basin", "beacon", "beagle", "bean", "beaver", "beech", "beetle",
  "bell", "berry", "birch", "bishop", "bison", "blaze", "bloom", "blue",
  "boathouse", "bobcat", "bolt", "boreal", "bottle", "boulder", "bounce", "bracket",
  "braille", "brass", "bread", "breeze", "brick", "bridge", "bright", "bronze",
  "brook", "broom", "brush", "bubble", "bucket", "buffalo", "bugle", "cabin",
  "cable", "cactus", "cadet", "cairn", "camel", "canal", "candle", "canopy",
  "canyon", "canvas", "cargo", "carrot", "castle", "cedar", "cellar", "chalk",
  "charm", "cherry", "chess", "chime", "chisel", "cider", "cinder", "citrus",
  "civic", "clamp", "clay", "clever", "cliff", "cloak", "clock", "cloud",
  "clover", "cobalt", "cobweb", "comet", "compass", "copper", "coral", "cosmos",
  "cotton", "cougar", "cover", "cradle", "crane", "crayon", "cream", "creek",
  "crest", "cricket", "crimson", "crisp", "crown", "crumb", "crystal", "cubic",
  "cumin", "curly", "cushion", "cypress", "dagger", "dahlia", "daisy", "dapper",
  "dawn", "deacon", "delta", "denim", "desert", "diesel", "dimply", "dinghy",
  "dinner", "dobby", "dolphin", "domino", "donut", "dragon", "drawer", "dream",
  "drift", "drizzle", "drowsy", "duckling", "dune", "dusk", "eager", "eagle",
  "early", "earth", "easel", "east", "echo", "eclair", "edible", "eerie",
  "eggplant", "eight", "elbow", "elder", "electric", "elegant", "elephant", "elfin",
  "elixir", "ember", "emerald", "empire", "emulate", "ending", "energy", "engine",
  "enjoy", "ensign", "entire", "envelope", "epoch", "equal", "eraser", "ermine",
  "escort", "essay", "estate", "ethanol", "evening", "event", "exile", "extra",
  "fabric", "falcon", "fancy", "feather", "fennel", "fern", "ferry", "fiber",
  "fiddle", "figurine", "finch", "finger", "fiscal", "fisher", "fjord", "flag",
  "flamingo", "flannel", "flask", "fleece", "flint", "float", "flock", "florist",
  "floss", "flour", "flute", "foam", "focus", "folly", "forest", "fork",
  "fossil", "fountain", "foxglove", "frame", "freckle", "freeze", "fridge", "frost",
  "frothy", "fruity", "fudge", "funnel", "furnace", "fuzzy", "gadget", "galaxy",
  "gale", "gallery", "gamble", "garlic", "gather", "gauze", "gavel", "gecko",
  "gemstone", "gentle", "geyser", "ginger", "glass", "glide", "glossy", "glove",
];

export const PASSPHRASE_WORDS = 6;
