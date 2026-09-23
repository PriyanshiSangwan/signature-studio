import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Film,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Share2,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import axios from "axios";
import "@/App.css";
import "@/logo-overrides.css";
import "@/theme.css";
import "@/features.css";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const client = axios.create({ baseURL: API, withCredentials: true });
const contact = { phone: "+91 9521174243", email: "signaturestudio02@gmail.com", location: "Udaipur, Rajasthan" };
const LOGO_ASSET = "https://customer-assets-cm19k8pv.emergentagent.net/job_studio-portfolio-65/artifacts/e2n22xze_IMG_8064.PNG";
const CATEGORY_IMAGES = {
  "Restaurant / Café": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=85",
  "Gym / Fitness": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=85",
  Healthcare: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=85",
  "Fashion / Retail": "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=85",
  "Hotel & Resort": "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=900&q=85",
  "Creator / Brand": "https://images.unsplash.com/photo-1522542550221-31fd19575a2d?auto=format&fit=crop&w=900&q=85",
};
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=85";
const errorText = (error) => {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || "Invalid input").join(" ");
  return detail || error?.message || "Something went wrong.";
};

function Logo({ testId = "brand-logo" }) {
  return (
    <Link to="/" className="brand" data-testid={testId}>
      <img src={LOGO_ASSET} alt="SIGNATURE STUDIO" />
      <span>SIGNATURE STUDIO</span>
    </Link>
  );
}

function Header({ authed = false }) {
  return (
    <header className="site-header">
      <Logo testId="header-brand-logo" />
      {authed && (
        <div className="header-right">
          <Link to="/admin" className="owner-link" data-testid="admin-dashboard-link">
            STUDIO DESK <ArrowUpRight size={13} />
          </Link>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const digits = contact.phone.replace(/[^0-9]/g, "");
  return (
    <footer className="site-footer">
      <Logo testId="footer-brand-logo" />
      <span data-testid="footer-slogan">we create your signature edits &amp; design</span>
      <div className="footer-contact" data-testid="footer-contact">
        <div className="footer-line" data-testid="footer-phone-line">
          <a href={`tel:${contact.phone}`} className="footer-phone" data-testid="footer-phone">
            <Phone size={13} aria-label="Call" /> {contact.phone}
          </a>
          <a
            href={`https://wa.me/${digits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="footer-whatsapp"
            data-testid="footer-whatsapp"
            aria-label="WhatsApp"
          >
            <MessageCircle size={13} /> WhatsApp
          </a>
        </div>
        <a href={`mailto:${contact.email}`} className="footer-line" data-testid="footer-email">
          <Mail size={13} /> {contact.email}
        </a>
        <span className="footer-line" data-testid="footer-location">
          <MapPin size={13} /> {contact.location}
        </span>
      </div>
    </footer>
  );
}

// ---------- Public site ----------
function Home() {
  const [categories, setCategories] = useState([]);
  const [designCount, setDesignCount] = useState(0);
  const [selected, setSelected] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewerIndex, setViewerIndex] = useState(-1);
  
  const [uploading, setUploading] = useState(false);
  const nav = useNavigate();

  const reloadItems = useCallback(
    (category) =>
      client
        .get("/portfolio", { params: { category, media_type: "reel" } })
        .then((r) => setItems(r.data.items))
        .catch((err) => setError(errorText(err))),
    [],
  );

  useEffect(() => {
    Promise.all([
      client.get("/portfolio/categories"),
      client.get("/portfolio", { params: { media_type: "design" } }),
    ])
      .then(([cats, des]) => {
        setCategories(cats.data.categories);
        setDesignCount(des.data.items.length);
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
    
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    reloadItems(selected).finally(() => setLoading(false));
  }, [selected, reloadItems]);

  const uploadReels = async (files) => {
  if (!files.length) return;

  setUploading(true);
  setError("");

  try {
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", "signature_studio_reels");

      const uploadRes = await fetch(
        "https://api.cloudinary.com/v1_1/dv6ab0bds/video/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!uploadRes.ok) {
        throw new Error("Cloudinary upload failed");
      }

      const cloudinary = await uploadRes.json();

      await client.post("/admin/portfolio", {
        category: selected,
        media_type: "reel",
        title: "",
        label: "",
        media_url: cloudinary.secure_url,
        media_data: "",
        mime_type: file.type,
        featured: false,
      });
    }

    await reloadItems(selected);
  } catch (err) {
    setError(errorText(err));
  } finally {
    setUploading(false);
  }
};

  const openCategory = (category) => {
    setSelected(category);
    setItems([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const closeCategory = () => {
    setSelected("");
    setItems([]);
    setError("");
  };

  return (
    <div className="dark-shell">
      <Header />
      <main className="home-main">
        {selected ? (
          <WorkView
            category={selected}
            items={items}
            loading={loading}
            error={error}
            uploading={uploading}
            onUpload={uploadReels}
            onBack={closeCategory}
            onOpenViewer={setViewerIndex}
          />
        ) : (
          <>
            <section className="hero">
              <p className="micro-label">CREATIVE CONTENT STUDIO</p>
              <h1>
                WE CREATE YOUR <span>SIGNATURE</span> EDITS &amp; DESIGN
              </h1>
              <p className="hero-note">Choose your niche to view Reels</p>
            </section>
            <section className="category-section">
              <div className="section-label">
                <span>SELECT YOUR NICHE</span>
                <span>
                  {String(categories.length || 0).padStart(2, "0")} CATEGORIES
                </span>
              </div>
              {error && (
                <p className="error-message" data-testid="portfolio-error">
                  {error}
                </p>
              )}
              {loading && !categories.length ? (
                <div className="loading-state" data-testid="categories-loading">
                  <Loader2 className="spin" /> LOADING CATEGORIES
                </div>
              ) : categories.length ? (
                <div className="category-grid" data-testid="category-list">
                  {categories.map((category, index) => (
                    <button
                      key={category}
                      type="button"
                      className="category-card"
                      onClick={() => openCategory(category)}
                      data-testid={`category-${category.toLowerCase().replaceAll(" ", "-").replaceAll("/", "")}`}
                    >
                      <img src={CATEGORY_IMAGES[category] || FALLBACK_IMAGE} alt="" />
                      <span className="card-shade" />
                      <span className="category-index">{String(index + 1).padStart(2, "0")}</span>
                      <strong>{category}</strong>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span>+</span>
                  <p>NO NICHES PUBLISHED YET</p>
                </div>
              )}
            </section>
            
              <section className="designs-cta-section" data-testid="designs-cta-section">
                <button
                  type="button"
                  className="designs-cta"
                  onClick={() => nav("/designs")}
                  data-testid="see-designs-button"
                >
                  SEE OUR CREATIVE DESIGNS
                  <ArrowUpRight size={22} strokeWidth={2.5} />
                </button>
              </section>
            )
          </>
        )}
      </main>
      <Footer />
      {viewerIndex >= 0 && (
        <Lightbox items={items} index={viewerIndex} onClose={() => setViewerIndex(-1)} onIndex={setViewerIndex} />
      )}
    </div>
  );
}

function WorkView({ category, items, loading, error, uploading, onUpload, onBack, onOpenViewer }) {
  const inputRef = useRef(null);
  const handleFiles = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length) onUpload(files);
    event.target.value = "";
  };
  return (
    <section className="work-view" data-testid="portfolio-section">
      <div className="work-toolbar work-toolbar-bold">
        <button onClick={onBack} className="back-control" data-testid="portfolio-back-button">
          <ArrowLeft size={16} /> ALL NICHES
        </button>
        <span className="work-toolbar-category" data-testid="current-category-label">
          {category.toUpperCase()}
        </span>
        <span className="work-toolbar-tag">REELS</span>
      </div>
      <div className="work-heading">
        <p className="micro-label">{category.toUpperCase()} / SELECTED WORK</p>
        <h1>REELS</h1>
      </div>
      {error && (
        <p className="error-message" data-testid="portfolio-error">
          {error}
        </p>
      )}
      {loading || uploading ? (
        <div className="loading-state" data-testid="portfolio-loading">
          <Loader2 className="spin" /> {uploading ? "UPLOADING REELS" : "LOADING WORK"}
        </div>
      ) : items.length ? (
        <div className="media-grid" data-testid="portfolio-grid">
          {items.map((item, index) => (
            <MediaCard item={item} key={item.id} onOpen={() => onOpenViewer(index)} />
          ))}
        </div>
      ) : (
        <div className="empty-state" data-testid="portfolio-empty">
          <span>+</span>
          <p>NO REELS IN THIS CATEGORY YET</p>
          
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={handleFiles}
                data-testid="empty-upload-input"
              />
              <button
                type="button"
                className="designs-cta"
                onClick={() => inputRef.current?.click()}
                data-testid="empty-upload-button"
              >
                UPLOAD REELS
                <ArrowUpRight size={22} strokeWidth={2.5} />
              </button>

        </div>
      )}
    </section>
  );
}

function DesignsPage() {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewerIndex, setViewerIndex] = useState(-1);
  const nav = useNavigate();

  useEffect(() => {
    client
      .get("/portfolio", { params: { media_type: "design" } })
      .then((r) => setDesigns(r.data.items))
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dark-shell">
      <Header />
      <main className="home-main">
        <section className="work-view" data-testid="designs-page">
          <div className="work-toolbar work-toolbar-bold">
            <button onClick={() => nav("/")} className="back-control" data-testid="designs-back-button">
              <ArrowLeft size={16} /> BACK TO HOME
            </button>
            <span className="work-toolbar-category">CREATIVE DESIGN</span>
            <span className="work-toolbar-tag">{String(designs.length).padStart(2, "0")} PIECES</span>
          </div>
          <div className="work-heading">
            <p className="micro-label">SIGNATURE STUDIO / DESIGN LIBRARY</p>
            <h1>DESIGNS</h1>
          </div>
          {error && (
            <p className="error-message" data-testid="designs-error">
              {error}
            </p>
          )}
          {loading ? (
            <div className="loading-state" data-testid="designs-loading">
              <Loader2 className="spin" /> LOADING DESIGNS
            </div>
          ) : designs.length ? (
            <div className="media-grid" data-testid="designs-grid">
              {designs.map((item, index) => (
                <MediaCard item={item} key={item.id} onOpen={() => setViewerIndex(index)} />
              ))}
            </div>
          ) : (
            <div className="empty-state" data-testid="designs-empty">
              <span>+</span>
              <p>NO DESIGNS YET</p>
            </div>
          )}
        </section>
      </main>
      <Footer />
      {viewerIndex >= 0 && (
        <Lightbox items={designs} index={viewerIndex} onClose={() => setViewerIndex(-1)} onIndex={setViewerIndex} />
      )}
    </div>
  );
}

function MediaCard({ item, onOpen }) {
  const source = item.media_data || item.media_url;
  const [shareOpen, setShareOpen] = useState(false);
  return (
    <article className="media-card" data-testid={`portfolio-item-${item.id}`}>
      <button type="button" className="media-thumb" onClick={onOpen} data-testid={`portfolio-open-${item.id}`}>
        {item.media_type === "reel" ? (
          <video src={source} muted playsInline preload="metadata" data-testid={`portfolio-video-${item.id}`} />
        ) : (
          <img src={source} alt={item.title || item.category} data-testid={`portfolio-image-${item.id}`} />
        )}
        {item.featured && (
          <span className="featured-flag" data-testid={`portfolio-featured-${item.id}`}>
            <Star size={12} /> FEATURED
          </span>
        )}
      </button>
      <div className="media-meta">
        {(item.title || item.label) ? (
          <div>
            {item.label && <span>{item.label}</span>}
            {item.title && <h3>{item.title}</h3>}
          </div>
        ) : (
          <span className="media-spacer" aria-hidden="true" />
        )}
        <button
          type="button"
          className="share-toggle"
          onClick={(event) => {
            event.stopPropagation();
            setShareOpen((current) => !current);
          }}
          data-testid={`share-toggle-${item.id}`}
          aria-label="Share this work"
        >
          <Share2 size={14} />
        </button>
      </div>
      {shareOpen && <ShareMenu item={item} onClose={() => setShareOpen(false)} />}
    </article>
  );
}

function ShareMenu({ item, onClose }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = item.media_url || item.media_data || window.location.href;
  const title = item.title || item.label || item.category;
  const message = `${title} - Signature Studio: ${shareUrl}`;
  const encoded = encodeURIComponent(message);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this link", shareUrl);
    }
  };
  return (
    <div className="share-menu" data-testid={`share-menu-${item.id}`}>
      <a
        className="share-option"
        href={`https://api.whatsapp.com/send?text=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`share-whatsapp-${item.id}`}
      >
        <MessageCircle size={13} /> WhatsApp
      </a>
      <a
        className="share-option"
        href={`mailto:?subject=${encodeURIComponent(`Signature Studio - ${title}`)}&body=${encoded}`}
        data-testid={`share-email-${item.id}`}
      >
        <Mail size={13} /> Email
      </a>
      <button type="button" className="share-option" onClick={copy} data-testid={`share-copy-${item.id}`}>
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy Link"}
      </button>
      <button type="button" className="share-option share-close" onClick={onClose} data-testid={`share-close-${item.id}`}>
        Close
      </button>
    </div>
  );
}

function Lightbox({ items, index, onClose, onIndex }) {
  const item = items[index];
  useEffect(() => {
    const handler = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndex((index + 1) % items.length);
      if (event.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [index, items.length, onClose, onIndex]);
  if (!item) return null;
  const source = item.media_data || item.media_url;
  const prev = () => onIndex((index - 1 + items.length) % items.length);
  const next = () => onIndex((index + 1) % items.length);
  return (
    <div className="lightbox" data-testid="lightbox" onClick={onClose}>
      <button
        type="button"
        className="lightbox-close"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        data-testid="lightbox-close"
        aria-label="Close viewer"
      >
        <X size={20} />
      </button>
      {items.length > 1 && (
        <button
          type="button"
          className="lightbox-nav lightbox-prev"
          onClick={(event) => {
            event.stopPropagation();
            prev();
          }}
          data-testid="lightbox-prev"
          aria-label="Previous"
        >
          <ChevronLeft size={26} />
        </button>
      )}
      <div className="lightbox-frame" onClick={(event) => event.stopPropagation()}>
        {item.media_type === "reel" ? (
          <video src={source} controls autoPlay playsInline data-testid="lightbox-video" />
        ) : (
          <img src={source} alt={item.title || item.category} data-testid="lightbox-image" />
        )}
        <div className="lightbox-caption">
          {item.label && <span>{item.label}</span>}
          {item.title && <h3>{item.title}</h3>}
        </div>
      </div>
      {items.length > 1 && (
        <button
          type="button"
          className="lightbox-nav lightbox-next"
          onClick={(event) => {
            event.stopPropagation();
            next();
          }}
          data-testid="lightbox-next"
          aria-label="Next"
        >
          <ChevronRight size={26} />
        </button>
      )}
    </div>
  );
}

// ---------- Auth pages ----------
function AuthFrame({ children }) {
  return (
    <div className="dark-shell auth-shell">
      <Header />
      <main className="auth-main">
        <div className="auth-intro">
          <p className="micro-label">SIGNATURE STUDIO / PRIVATE AREA</p>
          <p>
            Portfolio Manager
            <br />
            For Studio Team
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await client.post("/auth/login", { email, password });
      nav("/admin");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthFrame>
      <form className="auth-form" onSubmit={submit} data-testid="login-form">
        <p className="micro-label">OWNER ACCESS / SIGN IN</p>
        <h1>
          WELCOME
          <br />
          <span>BACK.</span>
        </h1>
        <label>
          EMAIL
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required data-testid="login-email-input" />
        </label>
        <label>
          PASSWORD
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength="8"
            required
            data-testid="login-password-input"
          />
        </label>
        {error && (
          <p className="error-message" data-testid="login-error">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={loading} data-testid="login-submit-button">
          {loading ? <Loader2 className="spin" size={14} /> : "LOGIN"} <ArrowUpRight size={14} />
        </button>
        <Link className="auth-secondary" to="/forgot-password" data-testid="forgot-password-link">
          FORGOT PASSWORD?
        </Link>
        <Link className="auth-secondary" to="/" data-testid="login-back-link">
          RETURN TO SITE
        </Link>
      </form>
    </AuthFrame>
  );
}

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ loading: false, done: false, error: "" });
  const submit = async (event) => {
    event.preventDefault();
    setState({ loading: true, done: false, error: "" });
    try {
      await client.post("/auth/forgot-password", { email });
      setState({ loading: false, done: true, error: "" });
    } catch (err) {
      setState({ loading: false, done: false, error: errorText(err) });
    }
  };
  return (
    <AuthFrame>
      <form className="auth-form" onSubmit={submit} data-testid="forgot-form">
        <p className="micro-label">OWNER ACCESS / PASSWORD RESET</p>
        <h1>
          RESET
          <br />
          <span>PASSWORD.</span>
        </h1>
        <p className="auth-description">
          Enter the email tied to your Signature Studio account. We will send a secure link to set a new password.
        </p>
        <label>
          EMAIL
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            data-testid="forgot-email-input"
          />
        </label>
        {state.error && (
          <p className="error-message" data-testid="forgot-error">
            {state.error}
          </p>
        )}
        {state.done && (
          <p className="success-message" data-testid="forgot-success">
            <Check size={14} /> If that email is registered, a reset link is on its way.
          </p>
        )}
        <button className="primary-button" type="submit" disabled={state.loading} data-testid="forgot-submit-button">
          {state.loading ? <Loader2 className="spin" size={14} /> : "SEND RESET LINK"} <ArrowUpRight size={14} />
        </button>
        <Link className="auth-secondary" to="/login" data-testid="forgot-back-link">
          BACK TO LOGIN
        </Link>
      </form>
    </AuthFrame>
  );
}

function ResetPassword() {
  const location = useLocation();
  const nav = useNavigate();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    setError("");
    setLoading(true);
    try {
      await client.post("/auth/reset-password", { token, password });
      nav("/login");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthFrame>
      <form className="auth-form" onSubmit={submit} data-testid="reset-form">
        <p className="micro-label">OWNER ACCESS / SET NEW PASSWORD</p>
        <h1>
          NEW
          <br />
          <span>PASSWORD.</span>
        </h1>
        {!token && (
          <p className="error-message" data-testid="reset-missing-token">
            This link is missing its reset token. Request a fresh link.
          </p>
        )}
        <label>
          NEW PASSWORD
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength="8"
            required
            data-testid="reset-password-input"
          />
        </label>
        <label>
          CONFIRM PASSWORD
          <input
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            type="password"
            minLength="8"
            required
            data-testid="reset-confirm-input"
          />
        </label>
        {error && (
          <p className="error-message" data-testid="reset-error">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={loading || !token} data-testid="reset-submit-button">
          {loading ? <Loader2 className="spin" size={14} /> : "SAVE PASSWORD"} <ArrowUpRight size={14} />
        </button>
        <Link className="auth-secondary" to="/login" data-testid="reset-back-link">
          BACK TO LOGIN
        </Link>
      </form>
    </AuthFrame>
  );
}

function AcceptInvite() {
  const { token } = useParams();
  const nav = useNavigate();
  const [invite, setInvite] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    client
      .get(`/auth/invitation/${token}`)
      .then((r) => setInvite(r.data))
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [token]);
  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    setSubmitting(true);
    setError("");
    try {
      await client.post("/auth/accept-invite", { token, password });
      nav("/admin");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AuthFrame>
      <form className="auth-form" onSubmit={submit} data-testid="invite-form">
        <p className="micro-label">SIGNATURE STUDIO / TEAM INVITATION</p>
        <h1>
          JOIN THE
          <br />
          <span>TEAM.</span>
        </h1>
        {loading ? (
          <p className="loading-state" data-testid="invite-loading">
            <Loader2 className="spin" size={14} /> LOADING INVITATION
          </p>
        ) : invite ? (
          <p className="auth-description">
            You have been invited as a <strong>{invite.role}</strong> for {invite.email}. Set a password to activate the account.
          </p>
        ) : null}
        <label>
          PASSWORD
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength="8"
            required
            data-testid="invite-password-input"
          />
        </label>
        <label>
          CONFIRM PASSWORD
          <input
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            type="password"
            minLength="8"
            required
            data-testid="invite-confirm-input"
          />
        </label>
        {error && (
          <p className="error-message" data-testid="invite-error">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={submitting || !invite} data-testid="invite-submit-button">
          {submitting ? <Loader2 className="spin" size={14} /> : "ACCEPT INVITE"} <ArrowUpRight size={14} />
        </button>
        <Link className="auth-secondary" to="/login" data-testid="invite-login-link">
          I ALREADY HAVE AN ACCOUNT
        </Link>
      </form>
    </AuthFrame>
  );
}

// ---------- Admin dashboard ----------
function Admin() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [team, setTeam] = useState([]);
  const [tab, setTab] = useState("works");
  const [editing, setEditing] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const loadWorks = useCallback(async () => {
    const r = await client.get("/admin/portfolio");
    setItems(r.data.items);
  }, []);
  const loadCategories = useCallback(async () => {
    const r = await client.get("/admin/categories");
    setCategories(r.data.categories);
  }, []);
  const loadTeam = useCallback(async () => {
    const r = await client.get("/admin/team");
    setTeam(r.data.members);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const auth = await client.get("/auth/me");
        if (!active) return;
        setUser(auth.data);
        await Promise.all([loadWorks(), loadCategories(), auth.data.role === "OWNER" ? loadTeam() : Promise.resolve()]);
      } catch {
        if (active) nav("/login");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadWorks, loadCategories, loadTeam, nav]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const logout = async () => {
    await client.post("/auth/logout");
    nav("/");
  };

  if (loading)
    return (
      <div className="dark-shell loading-state full" data-testid="admin-loading">
        <Loader2 className="spin" /> OPENING STUDIO DESK
      </div>
    );
  if (!user) return null;
  const isOwner = user.role === "OWNER";

  const toggleFeatured = async (item) => {
    try {
      await client.patch(`/admin/portfolio/${item.id}/featured`, null, { params: { featured: !item.featured } });
      await loadWorks();
      setNotice(item.featured ? "REMOVED FROM FEATURED" : "FEATURED ON NICHE HOME");
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="dark-shell">
      <Header authed />
      <main className="admin-main">
        <div className="admin-title">
          <div>
            <p className="micro-label">
              PRIVATE STUDIO DESK / {user.email} / {user.role}
            </p>
            <h1>
              PORTFOLIO
              <br />
              <span>MANAGER</span>
            </h1>
          </div>
          <div className="admin-cta">
            {tab === "works" && (
              <button onClick={() => setEditing({})} className="primary-button" data-testid="add-portfolio-button">
                <Plus size={15} /> ADD WORK
              </button>
            )}
            {tab === "categories" && (
              <button onClick={() => setEditing({ __type: "category" })} className="primary-button" data-testid="add-category-button">
                <Plus size={15} /> ADD NICHE
              </button>
            )}
            {tab === "team" && isOwner && (
              <button onClick={() => setInviteOpen(true)} className="primary-button" data-testid="invite-member-button">
                <UserPlus size={15} /> INVITE MEMBER
              </button>
            )}
          </div>
        </div>

        <nav className="admin-tabs" data-testid="admin-tabs">
          <button className={tab === "works" ? "active" : ""} onClick={() => setTab("works")} data-testid="tab-works">
            <Film size={13} /> WORKS
          </button>
          <button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")} data-testid="tab-categories">
            <Layers size={13} /> NICHES
          </button>
          {isOwner && (
            <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")} data-testid="tab-team">
              <Users size={13} /> TEAM
            </button>
          )}
        </nav>

        {error && (
          <p className="error-message" data-testid="admin-error">
            {error}
          </p>
        )}
        {notice && (
          <p className="success-message" data-testid="admin-success">
            <Check size={14} /> {notice}
          </p>
        )}

        {tab === "works" && (
          <div className="admin-list" data-testid="admin-portfolio-list">
            {items.length ? (
              items.map((item) => (
                <div className="admin-row" key={item.id} data-testid={`admin-item-${item.id}`}>
                  <div className="admin-thumb">
                    {item.media_type === "reel" ? <Film size={19} /> : <img src={item.media_data || item.media_url} alt="" />}
                  </div>
                  <div>
                    <span data-testid={`admin-item-label-${item.id}`}>
                      {item.category} / {item.media_type}
                    </span>
                    <h3>{item.title || "UNTITLED STUDY"}</h3>
                  </div>
                  <div className="row-actions">
                    <button
                      onClick={() => toggleFeatured(item)}
                      title={item.featured ? "Unfeature" : "Feature"}
                      className={item.featured ? "star-active" : ""}
                      data-testid={`feature-item-${item.id}`}
                    >
                      <Star size={15} fill={item.featured ? "currentColor" : "none"} />
                    </button>
                    <button onClick={() => setEditing(item)} title="Edit" data-testid={`edit-item-${item.id}`}>
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm("Delete this work?")) return;
                        try {
                          await client.delete(`/admin/portfolio/${item.id}`);
                          await loadWorks();
                          setNotice("WORK REMOVED");
                        } catch (err) {
                          setError(errorText(err));
                        }
                      }}
                      title="Delete"
                      data-testid={`delete-item-${item.id}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <span>+</span>
                <p>YOUR WORK LIBRARY IS READY FOR ITS FIRST PIECE.</p>
              </div>
            )}
          </div>
        )}

        {tab === "categories" && (
          <CategoryList
            categories={categories}
            onEdit={(cat) => setEditing({ __type: "category", ...cat })}
            reload={async () => {
              await loadCategories();
              await loadWorks();
            }}
            setNotice={setNotice}
            setError={setError}
          />
        )}

        {tab === "team" && isOwner && (
          <TeamList currentUser={user} members={team} reload={loadTeam} setNotice={setNotice} setError={setError} />
        )}
      </main>
      <footer className="admin-footer">
        <span data-testid="signed-in-user">
          SIGNED IN AS {user.email} ({user.role})
        </span>
        <button onClick={logout} data-testid="logout-button">
          <LogOut size={14} /> SIGN OUT
        </button>
      </footer>
      {editing !== null && editing.__type !== "category" && (
        <PortfolioForm
          item={editing}
          categories={categories}
          close={() => setEditing(null)}
          saved={async () => {
            setEditing(null);
            await loadWorks();
            setNotice("WORK SAVED TO LIVE PORTFOLIO");
          }}
        />
      )}
      {editing !== null && editing.__type === "category" && (
        <CategoryForm
          item={editing}
          close={() => setEditing(null)}
          saved={async () => {
            setEditing(null);
            await loadCategories();
            setNotice("NICHE SAVED");
          }}
        />
      )}
      {inviteOpen && (
        <InviteForm
          close={() => setInviteOpen(false)}
          saved={async () => {
            setInviteOpen(false);
            await loadTeam();
            setNotice("INVITATION EMAIL SENT");
          }}
        />
      )}
    </div>
  );
}

function PortfolioForm({ item, categories, close, saved }) {
  const options = useMemo(
    () => (categories.length ? categories.filter((c) => !c.hidden).map((c) => c.name) : ["Restaurant / Café"]),
    [categories],
  );
  const [form, setForm] = useState({
    category: item.category || options[0] || "",
    media_type: item.media_type || "reel",
    title: item.title || "",
    label: item.label || "",
    media_url: item.media_url || "",
    media_data: item.media_data || "",
    mime_type: item.mime_type || "",
    featured: !!item.featured,
  });
  const [error, setError] = useState("");
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const onFile = (event) => {
    const selected = event.target.files[0];
    if (!selected) return;
    if (selected.size > 30 * 1024 * 1024) return setError("Choose a file under 30 MB.");
    const reader = new FileReader();
    reader.onload = () =>
      setForm((current) => ({
        ...current,
        media_data: reader.result,
        media_url: "",
        mime_type: selected.type,
        media_type: selected.type.startsWith("video") ? "reel" : "design",
      }));
    reader.readAsDataURL(selected);
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (!form.media_url && !form.media_data) throw new Error("Add a file or hosted media URL.");
      if (item.id) await client.put(`/admin/portfolio/${item.id}`, form);
      else await client.post("/admin/portfolio", form);
      saved();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <div className="modal-backdrop" onClick={close}>
      <form className="portfolio-form" onSubmit={submit} onClick={(event) => event.stopPropagation()} data-testid="portfolio-form">
        <button type="button" className="close-button" onClick={close} data-testid="close-portfolio-form">
          <X size={17} />
        </button>
        <p className="micro-label">{item.id ? "EDIT WORK" : "ADD NEW WORK"}</p>
        <h2>{item.id ? "REFINE THIS PIECE" : "ADD TO LIBRARY"}</h2>
        <label>
          NICHE / CATEGORY
          <select name="category" value={form.category} onChange={update} required data-testid="portfolio-category-input">
            {options.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="form-split">
          <label>
            TYPE
            <select name="media_type" value={form.media_type} onChange={update} data-testid="portfolio-type-input">
              <option value="reel">REEL / VIDEO</option>
              <option value="design">DESIGN / IMAGE</option>
            </select>
          </label>
          <label>
            SHORT LABEL
            <input name="label" value={form.label} onChange={update} placeholder="Campaign 01" data-testid="portfolio-label-input" />
          </label>
        </div>
        <label>
          TITLE
          <input name="title" value={form.title} onChange={update} placeholder="Optional title" data-testid="portfolio-title-input" />
        </label>
        <label>
          UPLOAD FILE
          <input type="file" accept="image/*,video/*" onChange={onFile} data-testid="portfolio-file-input" />
        </label>
        <div className="or-line">OR USE A HOSTED URL</div>
        <label>
          MEDIA URL
          <input name="media_url" value={form.media_url} onChange={update} placeholder="https://..." data-testid="portfolio-url-input" />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(event) => setForm({ ...form, featured: event.target.checked })}
            data-testid="portfolio-featured-input"
          />
          MARK AS FEATURED (SHOWS FIRST ON ITS NICHE PAGE)
        </label>
        {form.media_data && (
          <p className="file-ready" data-testid="file-ready-indicator">
            <Check size={14} /> FILE READY
          </p>
        )}
        {error && (
          <p className="error-message" data-testid="portfolio-form-error">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" data-testid="save-portfolio-button">
          SAVE TO LIVE PORTFOLIO <ArrowUpRight size={14} />
        </button>
      </form>
    </div>
  );
}

function CategoryList({ categories, onEdit, reload, setNotice, setError }) {
  const toggleHidden = async (cat) => {
    try {
      await client.patch(`/admin/categories/${cat.id}`, { hidden: !cat.hidden });
      await reload();
      setNotice(cat.hidden ? "NICHE VISIBLE ON SITE" : "NICHE HIDDEN FROM SITE");
    } catch (err) {
      setError(errorText(err));
    }
  };
  const remove = async (cat) => {
    if (!window.confirm(`Delete niche "${cat.name}"?`)) return;
    try {
      await client.delete(`/admin/categories/${cat.id}`);
      await reload();
      setNotice("NICHE REMOVED");
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <div className="admin-list" data-testid="admin-category-list">
      {categories.length ? (
        categories.map((cat) => (
          <div className="admin-row" key={cat.id} data-testid={`admin-category-${cat.id}`}>
            <div className="admin-thumb">
              <Layers size={19} />
            </div>
            <div>
              <span>{cat.hidden ? "HIDDEN" : "VISIBLE ON SITE"}</span>
              <h3>{cat.name}</h3>
            </div>
            <div className="row-actions">
              <button
                onClick={() => toggleHidden(cat)}
                title={cat.hidden ? "Show" : "Hide"}
                data-testid={`toggle-category-${cat.id}`}
              >
                {cat.hidden ? <Link2 size={15} /> : <X size={15} />}
              </button>
              <button onClick={() => onEdit(cat)} title="Rename" data-testid={`edit-category-${cat.id}`}>
                <Pencil size={15} />
              </button>
              <button onClick={() => remove(cat)} title="Delete" data-testid={`delete-category-${cat.id}`}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="empty-state">
          <span>+</span>
          <p>NO NICHES YET. ADD YOUR FIRST ONE.</p>
        </div>
      )}
    </div>
  );
}

function CategoryForm({ item, close, saved }) {
  const [name, setName] = useState(item.name || "");
  const [hidden, setHidden] = useState(!!item.hidden);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (item.id) await client.patch(`/admin/categories/${item.id}`, { name, hidden });
      else await client.post("/admin/categories", { name, hidden });
      saved();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <div className="modal-backdrop" onClick={close}>
      <form className="portfolio-form" onSubmit={submit} onClick={(event) => event.stopPropagation()} data-testid="category-form">
        <button type="button" className="close-button" onClick={close} data-testid="close-category-form">
          <X size={17} />
        </button>
        <p className="micro-label">{item.id ? "EDIT NICHE" : "ADD NICHE"}</p>
        <h2>{item.id ? "RENAME OR HIDE" : "NEW CREATIVE NICHE"}</h2>
        <label>
          NAME
          <input value={name} onChange={(event) => setName(event.target.value)} required data-testid="category-name-input" />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} data-testid="category-hidden-input" />
          HIDE FROM PUBLIC SITE
        </label>
        {error && (
          <p className="error-message" data-testid="category-form-error">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" data-testid="save-category-button">
          SAVE NICHE <ArrowUpRight size={14} />
        </button>
      </form>
    </div>
  );
}

function TeamList({ currentUser, members, reload, setNotice, setError }) {
  const changeRole = async (member, role) => {
    try {
      await client.patch(`/admin/team/${member.id}`, { role });
      await reload();
      setNotice("ROLE UPDATED");
    } catch (err) {
      setError(errorText(err));
    }
  };
  const toggleActive = async (member) => {
    try {
      await client.patch(`/admin/team/${member.id}`, { is_active: !member.is_active });
      await reload();
      setNotice(member.is_active ? "MEMBER DISABLED" : "MEMBER ACTIVATED");
    } catch (err) {
      setError(errorText(err));
    }
  };
  const remove = async (member) => {
    if (!window.confirm(`Remove ${member.email}?`)) return;
    try {
      await client.delete(`/admin/team/${member.id}`);
      await reload();
      setNotice("MEMBER REMOVED");
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <div className="admin-list" data-testid="admin-team-list">
      {members.map((member) => {
        const self = member.email.toLowerCase() === currentUser.email.toLowerCase();
        return (
          <div className="admin-row" key={member.id} data-testid={`admin-member-${member.id}`}>
            <div className="admin-thumb">
              <Users size={19} />
            </div>
            <div>
              <span>
                {member.role} {member.is_active ? "" : "/ DISABLED"} {member.invited ? "/ PENDING INVITE" : ""}
              </span>
              <h3>
                {member.name} — {member.email}
              </h3>
            </div>
            <div className="row-actions team-actions">
              <select
                value={member.role}
                onChange={(event) => changeRole(member, event.target.value)}
                disabled={self}
                data-testid={`role-select-${member.id}`}
              >
                <option value="OWNER">OWNER</option>
                <option value="MANAGER">MANAGER</option>
              </select>
              <button
                type="button"
                onClick={() => toggleActive(member)}
                disabled={self}
                title={member.is_active ? "Disable" : "Enable"}
                data-testid={`toggle-active-${member.id}`}
              >
                {member.is_active ? <X size={15} /> : <Check size={15} />}
              </button>
              <button
                type="button"
                onClick={() => remove(member)}
                disabled={self}
                title="Remove"
                data-testid={`remove-member-${member.id}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InviteForm({ close, saved }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("MANAGER");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await client.post("/admin/team/invite", { email, name, role });
      saved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={close}>
      <form className="portfolio-form" onSubmit={submit} onClick={(event) => event.stopPropagation()} data-testid="invite-modal">
        <button type="button" className="close-button" onClick={close} data-testid="close-invite-form">
          <X size={17} />
        </button>
        <p className="micro-label">INVITE TEAM MEMBER</p>
        <h2>SEND INVITATION</h2>
        <label>
          NAME
          <input value={name} onChange={(event) => setName(event.target.value)} required data-testid="invite-name-input" />
        </label>
        <label>
          EMAIL
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required data-testid="invite-email-input" />
        </label>
        <label>
          ROLE
          <select value={role} onChange={(event) => setRole(event.target.value)} data-testid="invite-role-input">
            <option value="MANAGER">MANAGER — MANAGE REELS &amp; DESIGNS</option>
            <option value="OWNER">OWNER — FULL ACCESS</option>
          </select>
        </label>
        {error && (
          <p className="error-message" data-testid="invite-form-error">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={loading} data-testid="send-invite-button">
          {loading ? <Loader2 className="spin" size={14} /> : "SEND INVITE"} <ArrowUpRight size={14} />
        </button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/designs" element={<DesignsPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite/:token" element={<AcceptInvite />} />
        <Route path="/accept-invite" element={<AcceptInviteFromQuery />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function AcceptInviteFromQuery() {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token");
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={`/accept-invite/${token}`} replace />;
}
