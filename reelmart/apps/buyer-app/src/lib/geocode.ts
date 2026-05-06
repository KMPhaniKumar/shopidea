import * as Location from 'expo-location'

const MAPS_KEY = 'AIzaSyDtu00tuOZpIzPRASPFScWJRu1GkpaaSIU'

export interface GeoAddress {
  line1: string
  area: string
  city: string
  state: string
  pincode: string
  formatted: string
  lat: number
  lng: number
}

function getComponent(components: any[], ...types: string[]): string {
  return (
    components.find((c: any) => types.some(t => c.types.includes(t)))?.long_name ?? ''
  )
}

export async function detectCurrentAddress(): Promise<GeoAddress> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') throw new Error('Location permission denied')

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  })

  const { latitude, longitude } = pos.coords

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${MAPS_KEY}&language=en&result_type=street_address|sublocality|locality`
  )
  const json = await res.json()

  if (json.status !== 'OK' || !json.results?.length) {
    throw new Error('Could not determine address from your location')
  }

  // Pick the most detailed result (street_address first, else first result)
  const result =
    json.results.find((r: any) => r.types.includes('street_address')) ??
    json.results[0]

  const c = result.address_components

  const line1 = [
    getComponent(c, 'street_number'),
    getComponent(c, 'route', 'premise'),
  ]
    .filter(Boolean)
    .join(', ') || getComponent(c, 'sublocality_level_2', 'sublocality_level_1')

  const area = getComponent(c, 'sublocality_level_1', 'sublocality', 'neighborhood', 'locality')
  const city = getComponent(c, 'administrative_area_level_2', 'locality')
  const state = getComponent(c, 'administrative_area_level_1')
  const pincode = getComponent(c, 'postal_code')

  return {
    line1,
    area,
    city,
    state,
    pincode,
    formatted: result.formatted_address,
    lat: latitude,
    lng: longitude,
  }
}
