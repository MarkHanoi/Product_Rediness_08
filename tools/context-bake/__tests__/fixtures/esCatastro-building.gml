<?xml version="1.0" encoding="ISO-8859-1"?>
<!--Edificios de la D.G. del Catastro.-->
<!-- FIXTURE, trimmed from the REAL A.ES.SDGC.BU.14900.building.gml (Córdoba, 183,967,642 B,
     downloaded 2026-09-05). Two Buildings:
       1950501UG4915S — the founder's own parcel, CL Isla Lanzarote 4, Arroyo del Moro. Verbatim
                        attributes: currentUse 1_residential, officialArea 320 m², built 2020,
                        conditionOfConstruction functional, numberOfFloorsAboveGround **NIL**.
       9999901UG4915S — a synthetic single-part neighbour, kept minimal, so the spec can prove
                        max-of-parts is per-refcat and not global.
     Coordinates are the REAL ETRS89 / UTM30N (EPSG:25830) eastings/northings from the feed. -->
<gml:FeatureCollection gml:id="ES.SDGC.BU" xmlns:base="urn:x-inspire:specification:gmlas:BaseTypes:3.2" xmlns:bu-core2d="http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0" xmlns:bu-ext2d="http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <gml:featureMember>
    <bu-ext2d:Building gml:id="ES.SDGC.BU.1950501UG4915S">
      <bu-core2d:beginLifespanVersion>2020-08-10T00:00:00</bu-core2d:beginLifespanVersion>
      <bu-core2d:conditionOfConstruction>functional</bu-core2d:conditionOfConstruction>
      <bu-core2d:dateOfConstruction>
        <bu-core2d:DateOfEvent>
          <bu-core2d:beginning>2020-01-01T00:00:00</bu-core2d:beginning>
          <bu-core2d:end>2020-01-01T00:00:00</bu-core2d:end>
        </bu-core2d:DateOfEvent>
      </bu-core2d:dateOfConstruction>
      <bu-core2d:inspireId>
        <base:Identifier>
          <base:localId>1950501UG4915S</base:localId>
          <base:namespace>ES.SDGC.BU</base:namespace>
        </base:Identifier>
      </bu-core2d:inspireId>
      <bu-ext2d:geometry>
       <bu-core2d:BuildingGeometry>
        <bu-core2d:geometry>
         <gml:Surface gml:id="Surface_ES.SDGC.BU.1950501UG4915S" srsName="urn:ogc:def:crs:EPSG::25830">
           <gml:patches>
             <gml:PolygonPatch>
               <gml:exterior>
                 <gml:LinearRing>
                   <gml:posList srsDimension="2" count="5"> 341926.454 4194877.609 341941.277 4194877.609 341941.277 4194895.500 341926.454 4194895.500 341926.454 4194877.609</gml:posList>
                 </gml:LinearRing>
               </gml:exterior>
             </gml:PolygonPatch>
           </gml:patches>
         </gml:Surface>
        </bu-core2d:geometry>
       </bu-core2d:BuildingGeometry>
      </bu-ext2d:geometry>
      <bu-ext2d:currentUse>1_residential</bu-ext2d:currentUse>
      <bu-ext2d:numberOfFloorsAboveGround xsi:nil="true" nilReason="other:unpopulated"></bu-ext2d:numberOfFloorsAboveGround>
      <bu-ext2d:officialArea>
         <bu-ext2d:OfficialArea>
          <bu-ext2d:officialAreaReference>grossFloorArea</bu-ext2d:officialAreaReference>
          <bu-ext2d:value uom="m2">320</bu-ext2d:value>
         </bu-ext2d:OfficialArea>
      </bu-ext2d:officialArea>
    </bu-ext2d:Building>
  </gml:featureMember>
  <gml:featureMember>
    <bu-ext2d:Building gml:id="ES.SDGC.BU.9999901UG4915S">
      <bu-core2d:beginLifespanVersion>1994-03-02T00:00:00</bu-core2d:beginLifespanVersion>
      <bu-core2d:conditionOfConstruction>functional</bu-core2d:conditionOfConstruction>
      <bu-core2d:dateOfConstruction>
        <bu-core2d:DateOfEvent>
          <bu-core2d:beginning>1994-01-01T00:00:00</bu-core2d:beginning>
          <bu-core2d:end>1994-01-01T00:00:00</bu-core2d:end>
        </bu-core2d:DateOfEvent>
      </bu-core2d:dateOfConstruction>
      <bu-core2d:inspireId>
        <base:Identifier>
          <base:localId>9999901UG4915S</base:localId>
          <base:namespace>ES.SDGC.BU</base:namespace>
        </base:Identifier>
      </bu-core2d:inspireId>
      <bu-ext2d:geometry>
       <bu-core2d:BuildingGeometry>
        <bu-core2d:geometry>
         <gml:Surface gml:id="Surface_ES.SDGC.BU.9999901UG4915S" srsName="urn:ogc:def:crs:EPSG::25830">
           <gml:patches>
             <gml:PolygonPatch>
               <gml:exterior>
                 <gml:LinearRing>
                   <gml:posList srsDimension="2" count="5"> 341960.000 4194877.609 341975.000 4194877.609 341975.000 4194890.000 341960.000 4194890.000 341960.000 4194877.609</gml:posList>
                 </gml:LinearRing>
               </gml:exterior>
             </gml:PolygonPatch>
           </gml:patches>
         </gml:Surface>
        </bu-core2d:geometry>
       </bu-core2d:BuildingGeometry>
      </bu-ext2d:geometry>
      <bu-ext2d:currentUse>3_industrial</bu-ext2d:currentUse>
      <bu-ext2d:numberOfFloorsAboveGround xsi:nil="true" nilReason="other:unpopulated"></bu-ext2d:numberOfFloorsAboveGround>
    </bu-ext2d:Building>
  </gml:featureMember>
</gml:FeatureCollection>
