import { MapPin } from 'lucide-react'

export function MapPlaceholder() {
  return (
    <section aria-labelledby="map-heading" className="glass-card h-full overflow-hidden">
      <div className="border-b border-forest-900/8 px-5 py-4">
        <h2 className="text-base font-semibold text-forest-950" id="map-heading">
          Map preview
        </h2>
        <p className="mt-1 text-xs leading-5 text-ink-600">
          Illustrative only · no live facility locations
        </p>
      </div>
      <div
        aria-label="Map placeholder. No real-time hospital or ambulance locations are shown."
        className="map-placeholder relative grid min-h-[245px] place-items-center overflow-hidden p-6 sm:min-h-[300px]"
        role="img"
      >
        <div aria-hidden="true" className="map-road map-road-one" />
        <div aria-hidden="true" className="map-road map-road-two" />
        <div aria-hidden="true" className="map-road map-road-three" />
        <div aria-hidden="true" className="map-block map-block-one" />
        <div aria-hidden="true" className="map-block map-block-two" />
        <div aria-hidden="true" className="map-block map-block-three" />
        <div className="relative z-10 max-w-xs rounded-2xl border border-white/90 bg-white/80 p-4 text-center shadow-sm backdrop-blur-md">
          <span className="mx-auto grid size-10 place-items-center rounded-full bg-sage-100 text-forest-800">
            <MapPin aria-hidden="true" size={19} />
          </span>
          <p className="mt-3 text-sm font-semibold text-forest-950">Map coming later</p>
          <p className="mt-1 text-xs leading-5 text-ink-600">
            This placeholder does not show real-time hospital or ambulance locations.
          </p>
        </div>
      </div>
    </section>
  )
}
