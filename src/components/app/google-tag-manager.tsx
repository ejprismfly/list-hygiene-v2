import Script from "next/script"

const DEFAULT_GTM_ID = "GTM-N7976269"

function getGoogleTagManagerId() {
  return process.env.NEXT_PUBLIC_GTM_ID?.trim() || DEFAULT_GTM_ID
}

export function GoogleTagManager() {
  const gtmId = getGoogleTagManagerId()
  const gtmIdJson = JSON.stringify(gtmId)

  return (
    <Script
      id="google-tag-manager"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":
          new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.src=
          "https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,"script","dataLayer",${gtmIdJson});
        `,
      }}
    />
  )
}

export function GoogleTagManagerNoScript() {
  const gtmId = getGoogleTagManagerId()

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(
          gtmId
        )}`}
        height={0}
        width={0}
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  )
}
