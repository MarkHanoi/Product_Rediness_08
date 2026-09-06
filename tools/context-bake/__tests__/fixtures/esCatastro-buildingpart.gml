<?xml version="1.0" encoding="ISO-8859-1"?>
<!--Edificios de la D.G. del Catastro.-->
<!-- FIXTURE, trimmed from the REAL A.ES.SDGC.BU.14900.buildingpart.gml (Córdoba, 388,042,441 B,
     downloaded 2026-09-05). Three parts:
       1950501UG4915S_part1  floors 0  — the founder's PATIO. floors 0 is a REAL value, not a
                                         missing one; the spec pins that it survives as 0 and is
                                         never read as "unknown" and never defaulted.
       1950501UG4915S_part3  floors 3  — the tall block; the max, so the derived Building = 3.
       9999901UG4915S_part1  floors 2  — the neighbour, proving max-of-parts is PER REFCAT.
     ⚠ The `_partN` local ids are NOT stable across Catastro access paths (the WFS bbox form
     returns these same geometries renumbered — officialFootprints.mjs header fact 2), which is
     exactly why the adapter parses them only to recover the refcat stem and never emits them. -->
<gml:FeatureCollection gml:id="ES.SDGC.BU" xmlns:base="urn:x-inspire:specification:gmlas:BaseTypes:3.2" xmlns:bu-core2d="http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0" xmlns:bu-ext2d="http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <gml:featureMember>
    <bu-ext2d:BuildingPart gml:id="ES.SDGC.BU.1950501UG4915S_part1">
      <bu-core2d:beginLifespanVersion>2020-08-10T00:00:00</bu-core2d:beginLifespanVersion>
      <bu-core2d:conditionOfConstruction xsi:nil="true" nilReason="other:unpopulated"></bu-core2d:conditionOfConstruction>
      <bu-core2d:inspireId>
        <base:Identifier>
          <base:localId>1950501UG4915S_part1</base:localId>
          <base:namespace>ES.SDGC.BU</base:namespace>
        </base:Identifier>
      </bu-core2d:inspireId>
      <bu-ext2d:geometry>
       <bu-core2d:BuildingGeometry>
        <bu-core2d:geometry>
         <gml:Surface gml:id="Surface_ES.SDGC.BU.1950501UG4915S_part1" srsName="urn:ogc:def:crs:EPSG::25830">
           <gml:patches>
             <gml:PolygonPatch>
               <gml:exterior>
                 <gml:LinearRing>
                   <gml:posList srsDimension="2" count="5"> 341926.454 4194877.609 341931.454 4194877.609 341931.454 4194883.000 341926.454 4194883.000 341926.454 4194877.609</gml:posList>
                 </gml:LinearRing>
               </gml:exterior>
             </gml:PolygonPatch>
           </gml:patches>
         </gml:Surface>
        </bu-core2d:geometry>
       </bu-core2d:BuildingGeometry>
      </bu-ext2d:geometry>
      <bu-ext2d:numberOfFloorsAboveGround>0</bu-ext2d:numberOfFloorsAboveGround>
      <bu-ext2d:heightBelowGround uom="m">0</bu-ext2d:heightBelowGround>
      <bu-ext2d:numberOfFloorsBelowGround>0</bu-ext2d:numberOfFloorsBelowGround>
    </bu-ext2d:BuildingPart>
  </gml:featureMember>
  <gml:featureMember>
    <bu-ext2d:BuildingPart gml:id="ES.SDGC.BU.1950501UG4915S_part3">
      <bu-core2d:beginLifespanVersion>2020-08-10T00:00:00</bu-core2d:beginLifespanVersion>
      <bu-core2d:conditionOfConstruction xsi:nil="true" nilReason="other:unpopulated"></bu-core2d:conditionOfConstruction>
      <bu-core2d:inspireId>
        <base:Identifier>
          <base:localId>1950501UG4915S_part3</base:localId>
          <base:namespace>ES.SDGC.BU</base:namespace>
        </base:Identifier>
      </bu-core2d:inspireId>
      <bu-ext2d:geometry>
       <bu-core2d:BuildingGeometry>
        <bu-core2d:geometry>
         <gml:Surface gml:id="Surface_ES.SDGC.BU.1950501UG4915S_part3" srsName="urn:ogc:def:crs:EPSG::25830">
           <gml:patches>
             <gml:PolygonPatch>
               <gml:exterior>
                 <gml:LinearRing>
                   <gml:posList srsDimension="2" count="5"> 341933.000 4194884.000 341941.277 4194884.000 341941.277 4194895.500 341933.000 4194895.500 341933.000 4194884.000</gml:posList>
                 </gml:LinearRing>
               </gml:exterior>
             </gml:PolygonPatch>
           </gml:patches>
         </gml:Surface>
        </bu-core2d:geometry>
       </bu-core2d:BuildingGeometry>
      </bu-ext2d:geometry>
      <bu-ext2d:numberOfFloorsAboveGround>3</bu-ext2d:numberOfFloorsAboveGround>
      <bu-ext2d:heightBelowGround uom="m">0</bu-ext2d:heightBelowGround>
      <bu-ext2d:numberOfFloorsBelowGround>1</bu-ext2d:numberOfFloorsBelowGround>
    </bu-ext2d:BuildingPart>
  </gml:featureMember>
  <gml:featureMember>
    <bu-ext2d:BuildingPart gml:id="ES.SDGC.BU.9999901UG4915S_part1">
      <bu-core2d:beginLifespanVersion>1994-03-02T00:00:00</bu-core2d:beginLifespanVersion>
      <bu-core2d:conditionOfConstruction xsi:nil="true" nilReason="other:unpopulated"></bu-core2d:conditionOfConstruction>
      <bu-core2d:inspireId>
        <base:Identifier>
          <base:localId>9999901UG4915S_part1</base:localId>
          <base:namespace>ES.SDGC.BU</base:namespace>
        </base:Identifier>
      </bu-core2d:inspireId>
      <bu-ext2d:geometry>
       <bu-core2d:BuildingGeometry>
        <bu-core2d:geometry>
         <gml:Surface gml:id="Surface_ES.SDGC.BU.9999901UG4915S_part1" srsName="urn:ogc:def:crs:EPSG::25830">
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
      <bu-ext2d:numberOfFloorsAboveGround>2</bu-ext2d:numberOfFloorsAboveGround>
      <bu-ext2d:heightBelowGround uom="m">0</bu-ext2d:heightBelowGround>
      <bu-ext2d:numberOfFloorsBelowGround>0</bu-ext2d:numberOfFloorsBelowGround>
    </bu-ext2d:BuildingPart>
  </gml:featureMember>
</gml:FeatureCollection>
