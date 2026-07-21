import Script from "next/script"

export function GoogleTagManager() {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim()

  if (!gtmId) {
    return null
  }

  const gtmIdJson = JSON.stringify(gtmId)

  return (
    <>
      <Script
        id="google-tag-manager-data-layer"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
              "gtm.start": new Date().getTime(),
              event: "gtm.js"
            });
          `,
        }}
      />
      <Script
        id="google-tag-manager"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){
              w[l]=w[l]||[];
              var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";
              j.async=true;
              j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;
              f.parentNode.insertBefore(j,f);
            })(window,document,"script","dataLayer",${gtmIdJson});
          `,
        }}
      />
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(
            gtmId
          )}`}
          height={0}
          width={0}
          className="hidden"
          title="Google Tag Manager"
        />
      </noscript>
    </>
  )
}
