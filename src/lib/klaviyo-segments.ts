export type KlaviyoSegment = {
  id: string
  name?: string | null
  attributes?: {
    name?: string | null
    created?: string
  }
}

type KlaviyoSegmentsResponse = {
  data?: KlaviyoSegment[]
  links?: {
    next?: string | null
  }
  errors?: {
    detail?: string
    title?: string
  }[]
  message?: string
}

export function getSegmentName(segment?: KlaviyoSegment | null) {
  return (
    segment?.attributes?.name?.trim() ||
    segment?.name?.trim() ||
    "Unnamed segment"
  )
}

export function sortAndMapSegments(
  segments: KlaviyoSegment[],
  search = "",
  limit = 10
) {
  return [...segments]
    .sort((a, b) => {
      const aDate = new Date(a.attributes?.created || 0).getTime()
      const bDate = new Date(b.attributes?.created || 0).getTime()
      return bDate - aDate
    })
    .filter(
      (segment) =>
        !search ||
        getSegmentName(segment).toLowerCase().includes(search.toLowerCase()) ||
        segment.id.toLowerCase().includes(search.toLowerCase())
    )
    .slice(0, limit)
    .map((segment) => ({
      id: segment.id,
      name: getSegmentName(segment),
    }))
}

function klaviyoErrorMessage(
  response: Response,
  data: KlaviyoSegmentsResponse
) {
  const [error] = data.errors || []
  return (
    error?.detail ||
    error?.title ||
    data.message ||
    `Klaviyo segments request failed with status ${response.status}.`
  )
}

export async function fetchKlaviyoSegments(accessToken: string, limit = 300) {
  const headers = {
    accept: "application/vnd.api+json",
    Authorization: `Bearer ${accessToken}`,
    Revision: "2025-04-15",
  }
  const segments: KlaviyoSegment[] = []
  let url = "https://a.klaviyo.com/api/segments?page[size]=100"

  while (url && segments.length < limit) {
    const response = await fetch(url, { headers })
    const data = (await response.json().catch(() => ({}))) as KlaviyoSegmentsResponse

    if (!response.ok) {
      throw new Error(klaviyoErrorMessage(response, data))
    }

    if (Array.isArray(data.data)) {
      segments.push(...data.data)
    }

    const next = data.links?.next
    url = next && segments.length < limit ? next : ""
  }

  return segments.slice(0, limit)
}
