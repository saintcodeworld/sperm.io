
import { Keypair } from '@solana/web3.js';
import CryptoJS from 'crypto-js';
import bs58 from 'bs58';
import { supabase, supabaseAdmin } from './SupabaseClient';
import { solanaService } from './SolanaService';

// Browser-compatible word list for BIP39
const BIP39_WORDLIST = [
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act", "action", "actor", "actress", "actual", "adapt", "add", "addict", "address", "adjust", "admit", "adult", "advance", "advice", "aerobic", "affair", "afford", "afraid", "again", "age", "agent", "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album", "alcohol", "alert", "alien", "all", "alley", "allow", "almost", "alone", "alpha", "already", "also", "alter", "always", "amateur", "amazing", "among", "amount", "amused", "analyst", "anchor", "ancient", "anger", "angle", "angry", "animal", "ankle", "announce", "annual", "another", "answer", "antenna", "antique", "anxiety", "any", "apart", "apology", "appear", "apple", "approve", "april", "arch", "arctic", "area", "arena", "argue", "arm", "armed", "armor", "army", "around", "arrange", "arrest", "arrive", "arrow", "art", "artefact", "artist", "artwork", "ask", "aspect", "assault", "asset", "assist", "assume", "asthma", "athlete", "atom", "attack", "attend", "attitude", "attract", "auction", "audit", "august", "aunt", "author", "auto", "autumn", "average", "avocado", "avoid", "awake", "aware", "away", "awesome", "awful", "awkward", "axis", "baby", "bachelor", "bacon", "badge", "badly", "bag", "balance", "balcony", "ball", "bamboo", "banana", "banner", "bar", "barely", "bargain", "barrel", "base", "basic", "basket", "battle", "beach", "bean", "beauty", "because", "become", "beef", "before", "begin", "behave", "behind", "being", "below", "belt", "bench", "benefit", "best", "betray", "better", "between", "beyond", "bicycle", "bid", "bike", "bind", "biology", "bird", "birth", "bitter", "black", "blade", "blame", "blanket", "blast", "bleak", "bless", "blind", "block", "blood", "blossom", "blue", "blur", "blush", "board", "boat", "body", "boil", "bomb", "bond", "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss", "both", "bother", "bottle", "bottom", "bound", "bow", "bowl", "box", "boy", "brain", "brass", "brave", "bread", "break", "breast", "breed", "brick", "bridge", "brief", "bring", "bright", "bring", "broad", "broken", "brother", "brown", "brush", "budget", "build", "bulk", "bullet", "bundle", "bunker", "burden", "burger", "burst", "bus", "business", "busy", "butter", "buyer", "buzz", "cabbage", "cabin", "cable", "cactus", "cage", "cake", "call", "calm", "camera", "camp", "can", "canal", "cancel", "cancer", "candle", "cannon", "cannot", "canvas", "canyon", "capable", "capital", "captain", "capture", "carbon", "card", "cargo", "carry", "carve", "case", "cash", "cat", "catch", "cause", "cave", "cell", "cement", "census", "century", "certain", "chain", "chair", "chalk", "champion", "change", "chaos", "chapter", "charge", "chart", "chase", "cheap", "check", "cheese", "chemical", "cherry", "chest", "chicken", "chief", "child", "choice", "choose", "chronic", "chunk", "churn", "cigar", "cinnamon", "circle", "citizen", "city", "claim", "clap", "clarify", "claw", "clay", "clean", "clerk", "clever", "client", "cliff", "climb", "clinic", "clock", "clone", "close", "cloth", "cloud", "clown", "club", "clump", "cluster", "coach", "coast", "coconut", "code", "coffee", "coil", "coin", "collect", "color", "column", "combine", "come", "comfort", "comic", "common", "company", "concert", "conduct", "confirm", "congress", "connect", "consider", "control", "convince", "cook", "cool", "copper", "copy", "coral", "core", "corn", "correct", "cost", "cotton", "couch", "country", "couple", "courage", "course", "court", "cover", "crack", "craft", "crash", "crazy", "cream", "crime", "crisp", "cross", "crowd", "crown", "crucial", "cruel", "cruise", "crumble", "crunch", "cry", "crystal", "cube", "culture", "cup", "cupboard", "curious", "current", "curve", "cycle", "dad", "damage", "dance", "danger", "daring", "dash", "daughter", "dawn", "day", "deal", "debris", "decade", "december", "decide", "decline", "decorate", "decrease", "defense", "define", "defy", "degree", "delay", "deliver", "demand", "demon", "denial", "dense", "dental", "deny", "depart", "depend", "deposit", "depth", "derive", "describe", "desert", "design", "desk", "despair", "destroy", "detail", "detect", "determine", "develop", "device", "devote", "diagram", "dial", "diamond", "diary", "dice", "diesel", "diet", "differ", "digital", "dignity", "dilemma", "dinner", "direct", "dirty", "disable", "disagree", "disappear", "disaster", "discard", "discover", "dislike", "dismiss", "disorder", "display", "distance", "divert", "divide", "divorce", "dizzy", "doctor", "document", "dog", "dollar", "domain", "donate", "donkey", "donor", "door", "dose", "double", "doubt", "down", "dozen", "draft", "dragon", "drama", "drastic", "draw", "dream", "dress", "drift", "drill", "drink", "drive", "drop", "drum", "dry", "duck", "dumb", "dune", "during", "dust", "dutch", "duty", "dwarf", "dynamic", "eager", "eagle", "early", "earn", "earth", "easily", "east", "easy", "echo", "edge", "edit", "educate", "effort", "eight", "either", "elaborate", "elastic", "elbow", "elder", "elect", "elegant", "element", "elephant", "elevator", "elite", "else", "embark", "embody", "embrace", "emerge", "emotion", "emphasize", "empower", "empty", "enable", "enact", "end", "endless", "endorse", "enemy", "energy", "enforce", "engage", "enhance", "enjoy", "enlist", "enough", "enrich", "enter", "entire", "entry", "envelope", "episode", "equal", "equip", "era", "erase", "erode", "erosion", "error", "erupt", "escape", "essay", "essence", "estate", "eternal", "ethics", "evidence", "evil", "evoke", "evolve", "exact", "example", "excess", "exchange", "excite", "exclude", "excuse", "execute", "exercise", "exhaust", "exhibit", "exile", "exist", "exit", "exotic", "expand", "expect", "expire", "explain", "expose", "express", "extend", "exterior", "extra", "exult", "fabric", "face", "faculty", "fade", "faint", "faith", "fall", "false", "fame", "family", "famous", "fan", "fancy", "fantasy", "farm", "fashion", "fat", "fatal", "father", "fault", "favor", "favorite", "feature", "federal", "feel", "female", "fence", "festival", "fetch", "fever", "few", "fiber", "fiction", "field", "figure", "file", "film", "filter", "final", "find", "fine", "finger", "finish", "fire", "firm", "first", "fiscal", "fish", "fit", "fitness", "fix", "flag", "flame", "flash", "flat", "flavor", "flee", "flight", "flip", "float", "flock", "floor", "flower", "fluid", "focus", "folk", "follow", "food", "foot", "force", "forest", "forget", "fork", "fortune", "forum", "forward", "fossil", "foster", "found", "fox", "fragile", "frame", "frequent", "fresh", "friend", "fringe", "frog", "front", "frost", "frozen", "fruit", "fuel", "fun", "funny", "furnace", "fury", "future", "gadget", "gain", "galaxy", "gallery", "game", "gang", "garage", "garbage", "garden", "garlic", "garment", "gas", "gasp", "gate", "gather", "gauge", "gaze", "general", "genius", "genre", "gentle", "genuine", "gesture", "ghost", "giant", "gift", "giggle", "ginger", "giraffe", "girl", "give", "glad", "glance", "glare", "glass", "glide", "glimpse", "globe", "gloom", "glory", "glove", "glow", "glue", "goat", "goddess", "gold", "good", "goose", "gorilla", "gospel", "gossip", "govern", "gown", "grab", "grace", "grain", "grant", "grape", "graph", "grass", "grateful", "grave", "gravity", "gray", "great", "green", "grid", "grief", "grind", "grip", "grocery", "grow", "grunt", "guard", "guess", "guide", "guilt", "guitar", "gun", "gym", "habit", "hair", "half", "hammer", "hamster", "hand", "happy", "harbor", "hard", "harsh", "harvest", "hat", "have", "hawk", "hazard", "head", "health", "heart", "heavy", "hedgehog", "height", "hello", "helmet", "help", "hen", "hero", "hidden", "high", "hill", "hint", "hip", "hire", "history", "hobby", "hockey", "hold", "hole", "holiday", "hollow", "home", "honey", "hood", "hope", "horn", "horror", "horse", "hospital", "host", "hotel", "hour", "hover", "hub", "huge", "human", "humble", "humor", "hundred", "hunt", "hurdle", "hurry", "hurt", "husband", "hybrid", "ice", "icon", "idea", "identify", "idle", "ignore", "ill", "illegal", "illness", "image", "imitate", "immense", "immune", "impact", "impose", "improve", "impulse", "inch", "include", "income", "increase", "index", "indicate", "indoor", "industry", "infant", "inflict", "inform", "inhale", "inherit", "initial", "inject", "injury", "inmate", "inner", "innocent", "input", "inquiry", "insane", "insect", "inside", "inspire", "install", "intact", "interest", "into", "invest", "invite", "involve", "iron", "island", "isolate", "issue", "item", "ivory", "jacket", "jaguar", "jar", "jazz", "jeans", "jelly", "jewel", "job", "join", "joke", "journey", "judge", "juice", "jump", "jungle", "junior", "junk", "just", "kangaroo", "keen", "keep", "ketchup", "key", "kick", "kid", "kidney", "kind", "kingdom", "kiss", "kit", "kitchen", "kite", "kitten", "kiwi", "knee", "knife", "knock", "know", "lab", "label", "labor", "ladder", "lady", "lake", "lamp", "language", "laptop", "large", "later", "latin", "laugh", "laundry", "lava", "law", "lawn", "lawsuit", "layer", "lazy", "leader", "leaf", "learn", "lease", "least", "leather", "leave", "lecture", "left", "leg", "legal", "lemon", "lend", "length", "lens", "leopard", "lesson", "letter", "level", "liar", "liberty", "library", "license", "life", "lift", "light", "like", "limb", "limit", "link", "lion", "liquid", "list", "little", "live", "lizard", "load", "loan", "lobster", "local", "logic", "lonely", "long", "loop", "lottery", "loud", "lounge", "love", "loyal", "lucky", "lunch", "lunar", "luxury", "machine", "mad", "magic", "magnet", "maid", "mail", "main", "major", "make", "mammal", "man", "manage", "mandate", "mango", "mansion", "manual", "maple", "marble", "march", "margin", "marine", "market", "marriage", "mask", "mass", "master", "match", "material", "math", "matrix", "matter", "maximum", "maze", "meadow", "mean", "measure", "meat", "mechanic", "medal", "media", "melody", "melt", "member", "memory", "mention", "menu", "mercy", "merge", "merit", "merry", "mesh", "message", "metal", "method", "middle", "midnight", "milk", "million", "mind", "minimum", "minute", "miracle", "mirror", "misery", "miss", "mistake", "mix", "mixed", "mixture", "mobile", "model", "modify", "mom", "moment", "monitor", "monkey", "month", "moral", "more", "morning", "mosquito", "mother", "motion", "motor", "mountain", "mouse", "mouth", "move", "movie", "much", "muscle", "mushroom", "music", "must", "mutual", "myself", "mystery", "myth", "name", "napkin", "narrow", "nasty", "nation", "nature", "near", "neck", "need", "negative", "neighbor", "neither", "nephew", "nerve", "nest", "net", "network", "neutral", "never", "news", "next", "nice", "night", "noble", "noise", "nominee", "noodle", "normal", "north", "nose", "note", "nothing", "notice", "novel", "now", "nuclear", "number", "nurse", "nut", "obey", "object", "oblige", "obscure", "observe", "obtain", "obvious", "occur", "ocean", "october", "odor", "off", "offer", "office", "often", "oil", "okay", "old", "olive", "olympic", "once", "one", "onion", "online", "only", "open", "opera", "opinion", "oppose", "option", "orange", "orbit", "orchard", "order", "ordinary", "organ", "orient", "original", "orphan", "ostrich", "other", "outdoor", "outer", "output", "outside", "oval", "oven", "over", "own", "owner", "oxygen", "oyster", "ozone", "pact", "paddle", "page", "pair", "palace", "palm", "panda", "panel", "panic", "panther", "paper", "parade", "parent", "park", "parrot", "party", "pass", "patch", "path", "patient", "patrol", "pattern", "pause", "peace", "pen", "penalty", "pencil", "people", "pepper", "perfect", "permit", "person", "pet", "phone", "photo", "piano", "picnic", "picture", "piece", "pig", "pigeon", "pill", "pilot", "pink", "pioneer", "pipe", "pistol", "pitch", "pizza", "place", "planet", "plastic", "plate", "play", "please", "pledge", "plenty", "plural", "pocket", "poem", "poet", "point", "polar", "pole", "police", "pond", "pony", "pool", "popular", "portion", "portrait", "pose", "positive", "possess", "possible", "post", "potato", "pottery", "poverty", "powder", "power", "practice", "praise", "predict", "prefer", "prepare", "present", "pretty", "prevent", "price", "pride", "primary", "print", "priority", "prison", "private", "prize", "problem", "process", "produce", "profit", "program", "project", "promote", "proper", "protect", "proud", "provide", "public", "pull", "pulp", "pulse", "pumpkin", "punch", "pupil", "puppy", "purchase", "purpose", "purse", "push", "put", "puzzle", "pyramid", "quality", "quantum", "question", "quick", "quit", "quiz", "quote", "rabbit", "raccoon", "race", "rack", "radar", "radio", "rail", "rain", "raise", "rally", "ramp", "ranch", "random", "range", "rapid", "rare", "rate", "rather", "raven", "raw", "razor", "ready", "real", "reason", "rebel", "rebuild", "recall", "receive", "recipe", "record", "recycle", "reduce", "reflect", "reform", "refuse", "region", "regret", "regular", "reject", "relax", "release", "relief", "remain", "remember", "remind", "remove", "render", "renew", "rent", "reopen", "repair", "repeat", "replace", "request", "require", "research", "resemble", "resist", "resource", "response", "result", "retire", "retreat", "reunion", "review", "reward", "rhythm", "rib", "ribbon", "rice", "rich", "ride", "ridge", "rifle", "right", "rigid", "ring", "riot", "ripple", "risk", "ritual", "rival", "river", "road", "roast", "robot", "robust", "rocket", "romance", "roof", "rookie", "room", "rose", "rotate", "rough", "round", "route", "royal", "rubber", "rude", "rug", "rule", "run", "rural", "sad", "saddle", "sadness", "safe", "sail", "salad", "salmon", "salon", "salt", "salute", "same", "sample", "sand", "satisfy", "sauce", "sausage", "save", "save", "scale", "scan", "scare", "scatter", "scene", "scheme", "school", "science", "scissors", "scorpion", "scout", "scrap", "screen", "script", "scrub", "search", "season", "seat", "second", "secret", "section", "security", "seed", "seek", "segment", "sell", "send", "senior", "sense", "sentence", "series", "service", "session", "setup", "seven", "shadow", "shaft", "shallow", "share", "shed", "shell", "shift", "shine", "ship", "shirt", "shock", "shoe", "shoot", "shop", "short", "shoulder", "shove", "shrimp", "shrug", "shuffle", "shy", "sibling", "side", "siege", "sight", "sign", "silent", "silly", "silver", "similar", "simple", "since", "sing", "sink", "sister", "site", "situate", "size", "skate", "sketch", "ski", "skill", "skin", "skip", "skull", "slab", "slam", "sleep", "slender", "slice", "slide", "slight", "slim", "slogan", "slot", "slow", "slush", "small", "smart", "smile", "smoke", "smooth", "snack", "snake", "snap", "sniff", "snow", "soap", "soccer", "social", "soda", "soft", "soil", "solar", "solid", "solve", "someone", "song", "soon", "sorry", "sort", "soul", "sound", "soup", "source", "south", "space", "spare", "spatial", "speak", "special", "speed", "spell", "spend", "sphere", "spice", "spider", "spin", "spirit", "split", "spoil", "sponsor", "spoon", "sport", "spot", "spray", "spread", "spring", "spy", "square", "squeeze", "squirrel", "stable", "stadium", "staff", "stage", "stairs", "stamp", "stand", "start", "state", "stay", "steak", "steel", "steep", "steer", "stem", "step", "stereo", "stick", "still", "sting", "stock", "stomach", "stone", "stop", "store", "story", "storm", "story", "straight", "strange", "strap", "strategy", "street", "strike", "strong", "struggle", "student", "stuff", "stumble", "style", "subject", "submit", "subway", "success", "such", "sudden", "suffer", "sugar", "suggest", "suit", "summer", "sun", "sunny", "super", "supply", "support", "suppose", "sure", "surface", "surge", "surprise", "surround", "survey", "suspect", "sustain", "swallow", "swamp", "swap", "swarm", "swear", "sweet", "swift", "swim", "swing", "switch", "sword", "symbol", "symptom", "syrup", "system", "table", "tackle", "tag", "tail", "talent", "talk", "tank", "tape", "target", "task", "taste", "tattoo", "taxi", "teach", "team", "tell", "ten", "tenant", "tennis", "tent", "term", "test", "text", "thank", "that", "theme", "then", "theory", "there", "they", "thing", "this", "thought", "three", "thrive", "throw", "thumb", "thunder", "ticket", "tide", "tiger", "tilt", "timber", "time", "tiny", "tip", "tired", "tissue", "title", "toast", "today", "toddler", "together", "toilet", "token", "tomato", "tomorrow", "tone", "tongue", "tonight", "tool", "tooth", "top", "topic", "toss", "total", "touch", "toward", "tower", "town", "toy", "track", "trade", "traffic", "tragic", "train", "transfer", "trap", "trash", "travel", "tray", "treat", "tree", "trend", "trial", "tribe", "trick", "trigger", "trim", "trip", "trophy", "truck", "true", "truly", "trunk", "trust", "truth", "try", "tube", "tuition", "tumble", "tuna", "turkey", "turn", "turtle", "twelve", "twenty", "twice", "twin", "twist", "two", "type", "typical", "ugly", "umbrella", "unable", "unusual", "update", "upgrade", "uphold", "upon", "upper", "upset", "urban", "urge", "usage", "use", "used", "useful", "useless", "usual", "utility", "vacant", "vacuum", "vague", "valid", "valley", "valve", "van", "vanish", "vapor", "various", "vast", "vault", "vehicle", "velvet", "vendor", "venture", "venue", "verb", "verify", "version", "very", "vessel", "veteran", "viable", "vibrant", "vicious", "victory", "video", "view", "village", "vintage", "violet", "virtual", "virtue", "virus", "visa", "visit", "visual", "vital", "vivid", "vocal", "voice", "void", "volcano", "volume", "vote", "voyage", "wage", "wagon", "wait", "walk", "wall", "want", "warehouse", "warrior", "wash", "wasp", "waste", "water", "wave", "way", "wealth", "weapon", "wear", "weasel", "weather", "web", "wedding", "weekend", "weird", "welcome", "west", "whale", "what", "wheat", "wheel", "when", "where", "whip", "whisper", "wide", "width", "wife", "wild", "will", "win", "window", "wine", "wing", "wink", "winner", "winter", "wire", "wisdom", "wise", "wish", "witness", "wolf", "woman", "wonder", "wood", "wool", "word", "work", "world", "worry", "worth", "wrap", "wreck", "wrestle", "wrist", "write", "wrong", "yard", "year", "yellow", "young", "youth", "zebra", "zero", "zoo", "zone", "zoo"
];

// Browser-compatible mnemonic generation
function generateMnemonicFromEntropy(entropyHex: string): string {
  // Convert hex to binary string
  const binary = parseInt(entropyHex, 16).toString(2).padStart(256, '0');
  
  // Split into entropy (256 bits) and checksum (8 bits)
  const entropyBits = binary.substring(0, 256);
  const checksumBits = binary.substring(256, 264);
  
  // Combine entropy and checksum
  const fullBits = entropyBits + checksumBits;
  
  // Convert to 11-bit segments
  const segments = [];
  for (let i = 0; i < fullBits.length; i += 11) {
    segments.push(fullBits.substring(i, i + 11));
  }
  
  // Convert each segment to word index
  const words = segments.map(segment => {
    const index = parseInt(segment, 2);
    return BIP39_WORDLIST[index];
  });
  
  return words.join(' ');
}

const RAW_KEY = 'sperm-io-biological-vault-key-2025-x9';
const ENCRYPTION_KEY = CryptoJS.SHA256(RAW_KEY); 

export class WalletService {
  private encrypt(text: string): string {
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(text, ENCRYPTION_KEY, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return iv.toString() + ':' + encrypted.toString();
  }

  private decrypt(ciphertextWithIv: string): string {
    try {
      const parts = ciphertextWithIv.split(':');
      if (parts.length !== 2) throw new Error("Invalid encrypted format");
      
      const iv = CryptoJS.enc.Hex.parse(parts[0]);
      const ciphertext = parts[1];
      
      const decrypted = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      
      const result = decrypted.toString(CryptoJS.enc.Utf8);
      if (!result) throw new Error("Decryption produced empty result");
      return result;
    } catch (err) {
      console.error("[Vault] Decryption Failed:", JSON.stringify(err, null, 2));
      throw new Error("Failed to decrypt biological key. Check encryption key compatibility.");
    }
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Authoritatively fetches and decrypts a user's wallet.
   * Returns the Private Key as a Base58 string for direct wallet import.
   * REQUIRES: SUPABASE_SERVICE_ROLE_KEY to be configured.
   */
  public async fetchAndDecryptWallet(userId: string): Promise<{ publicKey: string, privateKeyBase58: string }> {
    console.log(`[Admin] Authoritative recovery initiated for ID: ${userId}`);
    
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('internal_pubkey, internal_privkey_encrypted')
      .eq('id', userId)
      .single();

    if (error) {
      console.error("[Admin] Recovery Fetch Error:", JSON.stringify(error, null, 2));
      throw new Error(`Registry fetch failed: ${error.message}`);
    }

    if (!data || data.internal_privkey_encrypted === 'PENDING') {
      throw new Error("Wallet record is empty or PENDING initialization.");
    }

    // 1. Decrypt the JSON array string
    const decryptedJson = this.decrypt(data.internal_privkey_encrypted);
    
    // 2. Parse JSON to number array, convert to Uint8Array
    const secretKeyArray = JSON.parse(decryptedJson);
    const secretKeyUint8 = new Uint8Array(secretKeyArray);
    
    // 3. Encode to Base58 for Phantom/Solflare import
    const base58Key = bs58.encode(secretKeyUint8);
    
    return {
      publicKey: data.internal_pubkey,
      privateKeyBase58: base58Key
    };
  }

  /**
   * Retrieves and decrypts the user's seedphrase from their encrypted private key.
   * Returns a 12-word mnemonic phrase for wallet recovery.
   */
  public async getSeedphrase(userId: string): Promise<string> {
    console.log(`[Vault] Retrieving seedphrase for user: ${userId}`);
    
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('internal_privkey_encrypted')
      .eq('id', userId)
      .single();

    if (error) {
      console.error("[Vault] Seedphrase fetch error:", JSON.stringify(error, null, 2));
      throw new Error(`Failed to fetch encrypted key: ${error.message}`);
    }

    if (!data || data.internal_privkey_encrypted === 'PENDING') {
      throw new Error("Wallet not properly initialized.");
    }

    try {
      // Decrypt the private key
      const decryptedJson = this.decrypt(data.internal_privkey_encrypted);
      const secretKeyArray = JSON.parse(decryptedJson);
      const secretKeyUint8 = new Uint8Array(secretKeyArray);

      // For Solana wallets, we need to derive a seed from the private key
      // Since Solana uses ed25519 keys, we'll create a compatible seed
      const seed = secretKeyUint8.slice(0, 32); // Take first 32 bytes as seed
      
      // Convert Uint8Array to hex string for entropy
      const seedHex = Array.from(seed)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Generate mnemonic from hex entropy using our custom function
      const mnemonic = generateMnemonicFromEntropy(seedHex);
      
      return mnemonic;
    } catch (err) {
      console.error("[Vault] Seedphrase generation failed:", err);
      throw new Error("Failed to generate seedphrase from private key.");
    }
  }

  /**
   * Authoritatively updates a PENDING profile with biological keys.
   */
  public async createAndStoreUserWallet(userId: string, username: string) {
    const maxRetries = 3;
    let lastError = null;

    console.log(`[Vault] Generating Devnet biological keys for ${username}...`);
    
    const kp = Keypair.generate();
    const publicKey = kp.publicKey.toBase58();
    const secretKeyString = JSON.stringify(Array.from(kp.secretKey));
    const encryptedPrivKey = this.encrypt(secretKeyString);

    // Generate seedphrase from the private key
    const seed = kp.secretKey.slice(0, 32); // Take first 32 bytes as seed
    
    // Convert Uint8Array to hex string for entropy
    const seedHex = Array.from(seed)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Generate mnemonic from hex entropy using our custom function
    const mnemonic = generateMnemonicFromEntropy(seedHex);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Fetch real balance from Solana blockchain
        const realBalance = await solanaService.getRealBalance(publicKey);
        console.log(`[Vault] Real balance for ${username}: ${realBalance} SOL`);

        const { error } = await supabase
          .from('profiles')
          .update({
            internal_pubkey: publicKey,
            internal_privkey_encrypted: encryptedPrivKey,
            account_balance: realBalance
          })
          .eq('id', userId);

        if (error) {
          console.error(`[Vault] Attempt ${attempt} Update Error:`, JSON.stringify(error, null, 2));
          lastError = error;
          if (attempt < maxRetries) await this.sleep(500);
          continue;
        }

        console.log(`[Vault] Record updated for ${username} with real balance ${realBalance} SOL (Attempt ${attempt})`);
        return { publicKey, encryptedPrivKey, seedphrase: mnemonic, balance: realBalance };
      } catch (err: any) {
        console.error(`[Vault] Attempt ${attempt} Exception:`, JSON.stringify(err, null, 2));
        lastError = err;
        if (attempt < maxRetries) await this.sleep(500);
      }
    }

    throw new Error(`Profile population failed: ${JSON.stringify(lastError, null, 2)}`);
  }
}

export const walletService = new WalletService();
