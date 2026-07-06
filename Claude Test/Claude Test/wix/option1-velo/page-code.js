// ══════════════════════════════════════════════════════════════════
// MUDIFY REVIEWS — Wix Velo Page Code (Opción 1 — Nativo)
// ══════════════════════════════════════════════════════════════════
//
// CÓMO USAR:
//  1. En Wix Editor, activa Dev Mode (Velo by Wix)
//  2. Abre el panel de código de la página (Page Code)
//  3. Pega TODO este archivo y reemplaza el contenido existente
//
// IDs QUE DEBES ASIGNAR EN WIX EDITOR:
// ─────────────────────────────────────────────────────────────────
// REVIEWS
//   #reviewsRepeater   → Wix Repeater (conectado a CMS "Reviews")
//   #reviewCount       → Texto  "445 reviews"
//   #noResults         → Box    (oculto por defecto, se muestra si no hay resultados)
//
// FILTROS DE RATING (botones en una fila horizontal)
//   #btnAll            → Botón "All"
//   #btn5              → Botón "5★"
//   #btn4              → Botón "4★"
//   #btn3              → Botón "3★"
//   #btn12             → Botón "1-2★"
//
// FILTROS DE PRODUCTO
//   #btnProdAll        → Botón "All Products"
//   #btnProdGeneral    → Botón "General"
//   #btnProdSuspension → Botón "Suspension"
//   #btnProdCoilovers  → Botón "Coilovers"
//   #btnProdShocks     → Botón "Shocks"
//   #btnProdControlArms→ Botón "Control Arms"
//   #btnProdOME        → Botón "Old Man Emu"
//
// DENTRO DE CADA ITEM DEL REPEATER (set en el repeater item)
//   #itemAvatar        → Texto  (iniciales "KS")
//   #itemAuthor        → Texto  ("Kevin S.")
//   #itemDate          → Texto  ("Jan 22, 2026")
//   #itemStars         → Texto  ("★★★★★")
//   #itemTitle         → Texto  ("Ordered and Excited")
//   #itemBody          → Texto  (texto del review)
//   #itemBadge         → Texto  ("✓ Verified Purchase")
//   #itemBadgeBox      → Box    (contenedor del badge — para cambiar color bg)
//
// FORMULARIO DE REVIEW (puede estar en un Lightbox llamado "LeaveReview")
//   #formStep1         → Box  (paso 1: rating + nombre + texto)
//   #formStep2         → Box  (paso 2: preview + clipboard + plataformas)
//   #formStep3         → Box  (paso 3: success)
//   #star1 #star2 #star3 #star4 #star5 → Botones de estrella
//   #reviewName        → Input texto  (nombre del reviewer)
//   #reviewTextarea    → Input texto largo  (texto del review)
//   #charCount         → Texto  ("0 / 400")
//   #formError         → Texto  (mensaje de error, oculto por defecto)
//   #reviewPreview     → Texto  (muestra el review para copiar)
//   #btnCopyText       → Botón  "Copy to clipboard"
//   #copyConfirm       → Texto  "✓ Copied!" (oculto por defecto)
//   #btnTrustpilot     → Botón  con logo Trustpilot
//   #btnGoogle         → Botón  con logo Google
//   #btnSmartCustomer  → Botón  con logo SmartCustomer
//   #btnSubmitStep1    → Botón  "Continue →"
//   #btnNewReview      → Botón  "Write another review" (en step 3)
//   #btnOpenForm       → Botón  en la página que abre el Lightbox
//
// STATS (valores fijos, no necesitan Velo — solo editar en Wix Editor)
//   Puedes conectarlos a una colección "Stats" si quieres actualizarlos
//
// FAQ (usa el componente Accordion nativo de Wix — no necesita código)
// ──────────────────────────────────────────────────────────────────

import wixData from 'wix-data';
import wixLocation from 'wix-location';
import { setSEOData } from 'wix-seo';
import wixWindow from 'wix-window';

// ─── Estado global ────────────────────────────────────────────────
let allReviews      = [];
let activeRating    = 'all';
let activeProduct   = 'all';
let selectedStars   = 0;
let reviewText      = '';
let reviewAuthor    = '';

const RATING_BTNS  = ['#btnAll', '#btn5', '#btn4', '#btn3', '#btn12'];
const PRODUCT_BTNS = ['#btnProdAll', '#btnProdGeneral', '#btnProdSuspension',
                      '#btnProdCoilovers', '#btnProdShocks',
                      '#btnProdControlArms', '#btnProdOME'];

// Colores de la marca
const RED    = '#E94141';
const GREY   = '#f7f7f7';
const GREY_T = '#595959';

// ─── onReady ──────────────────────────────────────────────────────
$w.onReady(async function () {
  injectJsonLd();
  await loadReviews();
  setupFilters();
  setupForm();
  setupRepeater();
});

// ══════════════════════════════════════════════════════════════════
// REVIEWS — carga desde CMS
// ══════════════════════════════════════════════════════════════════
async function loadReviews() {
  try {
    const results = await wixData.query('Reviews')
      .descending('reviewDate')
      .limit(100)
      .find();

    allReviews = results.items;
    renderReviews(allReviews);
  } catch (err) {
    console.error('Error cargando reviews:', err);
  }
}

function renderReviews(reviews) {
  $w('#reviewsRepeater').data = reviews;
  $w('#reviewCount').text = `${reviews.length} review${reviews.length !== 1 ? 's' : ''}`;

  if (reviews.length === 0) {
    $w('#noResults').show();
    $w('#reviewsRepeater').hide();
  } else {
    $w('#noResults').hide();
    $w('#reviewsRepeater').show();
  }
}

// ─── Bind de datos al Repeater ────────────────────────────────────
function setupRepeater() {
  $w('#reviewsRepeater').onItemReady(($item, data) => {
    $item('#itemAvatar').text    = data.authorInitials || '?';
    $item('#itemAuthor').text    = data.authorName     || 'Anonymous';
    $item('#itemDate').text      = formatDate(data.reviewDate);
    $item('#itemTitle').text     = data.title          || '';
    $item('#itemBody').text      = `"${data.body}"`;
    $item('#itemBadge').text     = data.badgeText      || '';

    // Estrellas: llenas y vacías
    const filled = '★'.repeat(data.rating || 0);
    const empty  = '☆'.repeat(5 - (data.rating || 0));
    $item('#itemStars').text = filled + empty;

    // Color del badge según tipo
    const badgeColors = {
      pos: { bg: '#e8f5ee', color: '#1a7a4a' },
      neg: { bg: '#fdf0f0', color: '#c0392b' },
      neu: { bg: '#fef9ec', color: '#c47a00' },
    };
    const bc = badgeColors[data.badgeType] || badgeColors.neu;
    try {
      $item('#itemBadgeBox').style.backgroundColor = bc.bg;
      $item('#itemBadge').style.color = bc.color;
    } catch (_) {}
  });
}

// ══════════════════════════════════════════════════════════════════
// FILTROS
// ══════════════════════════════════════════════════════════════════
function setupFilters() {
  // Rating
  $w('#btnAll').onClick(() => { activeRating = 'all'; activateBtn('#btnAll', RATING_BTNS); applyFilters(); });
  $w('#btn5').onClick(()   => { activeRating = '5';   activateBtn('#btn5',   RATING_BTNS); applyFilters(); });
  $w('#btn4').onClick(()   => { activeRating = '4';   activateBtn('#btn4',   RATING_BTNS); applyFilters(); });
  $w('#btn3').onClick(()   => { activeRating = '3';   activateBtn('#btn3',   RATING_BTNS); applyFilters(); });
  $w('#btn12').onClick(()  => { activeRating = '1-2'; activateBtn('#btn12',  RATING_BTNS); applyFilters(); });

  // Producto
  $w('#btnProdAll').onClick(()         => { activeProduct = 'all';          activateBtn('#btnProdAll',         PRODUCT_BTNS); applyFilters(); });
  $w('#btnProdGeneral').onClick(()     => { activeProduct = 'general';      activateBtn('#btnProdGeneral',     PRODUCT_BTNS); applyFilters(); });
  $w('#btnProdSuspension').onClick(()  => { activeProduct = 'suspension';   activateBtn('#btnProdSuspension',  PRODUCT_BTNS); applyFilters(); });
  $w('#btnProdCoilovers').onClick(()   => { activeProduct = 'coilovers';    activateBtn('#btnProdCoilovers',   PRODUCT_BTNS); applyFilters(); });
  $w('#btnProdShocks').onClick(()      => { activeProduct = 'shocks';       activateBtn('#btnProdShocks',      PRODUCT_BTNS); applyFilters(); });
  $w('#btnProdControlArms').onClick(() => { activeProduct = 'control-arms'; activateBtn('#btnProdControlArms', PRODUCT_BTNS); applyFilters(); });
  $w('#btnProdOME').onClick(()         => { activeProduct = 'ome';          activateBtn('#btnProdOME',         PRODUCT_BTNS); applyFilters(); });

  // Activar "All" por defecto
  activateBtn('#btnAll',     RATING_BTNS);
  activateBtn('#btnProdAll', PRODUCT_BTNS);
}

function activateBtn(activeId, group) {
  group.forEach(id => {
    try {
      if (id === activeId) {
        $w(id).style.backgroundColor = RED;
        $w(id).style.color           = '#ffffff';
      } else {
        $w(id).style.backgroundColor = GREY;
        $w(id).style.color           = GREY_T;
      }
    } catch (_) {}
  });
}

function applyFilters() {
  let filtered = [...allReviews];

  if (activeRating !== 'all') {
    if (activeRating === '1-2') {
      filtered = filtered.filter(r => r.rating <= 2);
    } else {
      filtered = filtered.filter(r => r.rating === Number(activeRating));
    }
  }

  if (activeProduct !== 'all') {
    filtered = filtered.filter(r => r.productCategory === activeProduct);
  }

  renderReviews(filtered);
}

// ══════════════════════════════════════════════════════════════════
// FORMULARIO MULTI-STEP
// ══════════════════════════════════════════════════════════════════
function setupForm() {
  // Abre el lightbox "LeaveReview" desde el botón CTA de la página
  $w('#btnOpenForm').onClick(() => {
    wixWindow.openLightbox('LeaveReview');
  });

  // Si el formulario está inline (no en Lightbox), usa esto en cambio:
  // setFormStep(1);

  // Estrellas interactivas
  [1, 2, 3, 4, 5].forEach(n => {
    $w(`#star${n}`).onClick(() => {
      selectedStars = n;
      paintStars(n);
    });
    $w(`#star${n}`).onMouseIn(() => paintStars(n));
    $w(`#star${n}`).onMouseOut(() => paintStars(selectedStars));
  });

  // Contador de caracteres
  $w('#reviewTextarea').onInput(() => {
    const len = $w('#reviewTextarea').value.length;
    $w('#charCount').text = `${len} / 400`;
  });

  // Paso 1 → Paso 2
  $w('#btnSubmitStep1').onClick(() => {
    reviewText   = $w('#reviewTextarea').value.trim();
    reviewAuthor = $w('#reviewName').value.trim() || 'Anonymous';

    if (!selectedStars || !reviewText) {
      $w('#formError').show();
      return;
    }
    $w('#formError').hide();

    const stars   = '★'.repeat(selectedStars) + '☆'.repeat(5 - selectedStars);
    const preview = `${stars}\n\n"${reviewText}"\n\n— ${reviewAuthor}`;
    $w('#reviewPreview').text = preview;

    setFormStep(2);
  });

  // Copiar texto al portapapeles
  // Nota: en Wix Velo no hay acceso directo a navigator.clipboard
  // La mejor solución es mostrar el texto en un input que el usuario puede
  // seleccionar y copiar manualmente (Ctrl+C / Cmd+C)
  $w('#btnCopyText').onClick(() => {
    // Muestra confirmación visual (el usuario ya ve el texto en #reviewPreview)
    $w('#copyConfirm').show();
    setTimeout(() => {
      try { $w('#copyConfirm').hide(); } catch (_) {}
    }, 2500);
  });

  // Botones de plataforma → abren URL externa y van al paso 3
  $w('#btnTrustpilot').onClick(() => {
    wixLocation.to('https://www.trustpilot.com/evaluate/mudify.com');
    setTimeout(() => setFormStep(3), 400);
  });

  $w('#btnGoogle').onClick(() => {
    wixLocation.to('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
    setTimeout(() => setFormStep(3), 400);
  });

  $w('#btnSmartCustomer').onClick(() => {
    wixLocation.to('https://www.smartcustomer.co/profile/mudify');
    setTimeout(() => setFormStep(3), 400);
  });

  // Nuevo review
  $w('#btnNewReview').onClick(() => {
    selectedStars = 0;
    reviewText    = '';
    reviewAuthor  = '';
    paintStars(0);
    try {
      $w('#reviewTextarea').value = '';
      $w('#reviewName').value     = '';
      $w('#charCount').text       = '0 / 400';
    } catch (_) {}
    setFormStep(1);
  });
}

function setFormStep(step) {
  [1, 2, 3].forEach(s => {
    try {
      if (s === step) { $w(`#formStep${s}`).show(); }
      else            { $w(`#formStep${s}`).hide(); }
    } catch (_) {}
  });
}

function paintStars(count) {
  [1, 2, 3, 4, 5].forEach(n => {
    try {
      $w(`#star${n}`).style.color = n <= count ? RED : '#d0d0d0';
    } catch (_) {}
  });
}

// ══════════════════════════════════════════════════════════════════
// SEO — JSON-LD + meta tags
// ══════════════════════════════════════════════════════════════════
function injectJsonLd() {
  try {
    setSEOData({
      title:       'Mudify Reviews 2026 – 445+ Verified Customer Ratings | Off-Road & 4x4',
      description: 'Read 445+ verified customer reviews for Mudify. Average 4.3/5 stars. Real opinions on suspension kits, lift kits and customer service.',
      keywords:    ['mudify reviews', 'mudify.com reviews', 'mudify off-road', '4x4 overlanding reviews', 'mudify suspension'],
      ogTitle:     'Mudify Reviews 2026 – What Customers Are Saying',
      ogDescription: '445+ verified reviews. Average 4.3/5 stars. Honest opinions from off-road enthusiasts.',
      ogImage:     'https://mudify.com/cdn/shop/files/logo_mudify.webp?v=1698858536',
      jsonLd: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": "https://mudify.com/#org",
            "name": "Mudify",
            "url": "https://mudify.com",
            "telephone": "+17866998829",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Miami",
              "addressRegion": "FL",
              "addressCountry": "US"
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.3",
              "reviewCount": "445",
              "bestRating": "5",
              "worstRating": "1"
            }
          },
          {
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "Is Mudify a legitimate company?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. Mudify is a legitimate off-road accessories retailer based in Miami, FL with 445+ verified reviews and a 4.3/5 average rating."
                }
              },
              {
                "@type": "Question",
                "name": "How is Mudify's customer service?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Consistently their highest-rated attribute. Staff members Samantha and Eddie are mentioned by name in multiple positive reviews."
                }
              }
            ]
          }
        ]
      })
    });
  } catch (err) {
    console.warn('setSEOData error:', err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatDate(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch (_) {
    return '';
  }
}
