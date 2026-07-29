import Script from "next/script"

const DEFAULT_GOOGLE_TAG_ID = "G-HW48Q6PPY4"

export function GoogleAnalyticsTag() {
  const googleTagId =
    process.env.NEXT_PUBLIC_GOOGLE_TAG_ID?.trim() || DEFAULT_GOOGLE_TAG_ID
  const googleTagIdJson = JSON.stringify(googleTagId)

  return (
    <>
      <Script
        id="google-tag-loader"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
          googleTagId
        )}`}
      />
      <Script
        id="google-tag-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag("js", new Date());
            gtag("config", ${googleTagIdJson});
          `,
        }}
      />
    </>
  )
}
