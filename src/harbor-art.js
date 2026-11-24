// Paint the selected diorama using its source coordinates, aligned with the game board projection.
export function paintHarbor(pen, projectBoard) {
 const origin = projectBoard(0, 0);
 const xUnit = projectBoard(1, 0).x - origin.x;
 const yUnit = projectBoard(1, 0).y - origin.y;
 const xScale = xUnit / 48;
 const yScale = yUnit / 24;
 pen.save();
 pen.transform(xScale, 0, 0, yScale, origin.x - 602 * xScale, origin.y - 123 * yScale);

 function project(x, z, height = 0) {
  return [602 + (x-z)*48, 123 + (x+z)*24-height];
 }
 function polygon(points, fill, stroke, width = 1) {
  pen.beginPath();
  points.forEach(([x,y],i) => i === 0 ? pen.moveTo(x,y) : pen.lineTo(x,y));
  pen.closePath();
  if (fill) {pen.fillStyle = fill; pen.fill();}
  if (stroke) {pen.strokeStyle = stroke; pen.lineWidth = width; pen.stroke();}
 }
 function plane(points, fill, stroke, width) {
  polygon(points.map(point => project(...point)),fill,stroke,width);
 }
 function material(points, base, highlight, shadow) {
  const projected = points.map(point => project(...point));
  const ys = projected.map(([, y]) => y);
  const ramp = pen.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
  ramp.addColorStop(0, highlight);
  ramp.addColorStop(.48, '#ffffff00');
  ramp.addColorStop(1, shadow);
  polygon(projected, base);
  polygon(projected, ramp);
 }
 function line(points, color, width = 1) {
  pen.beginPath();
  points.forEach(([x,y],i) => i === 0 ? pen.moveTo(x,y) : pen.lineTo(x,y));
  pen.strokeStyle = color;
  pen.lineWidth = width;
  pen.lineCap = 'round';
  pen.lineJoin = 'round';
  pen.stroke();
 }
 function worldLine(points, color, width) {
  line(points.map(point => project(...point)),color,width);
 }
 function oval(x,y,rx,ry,fill,stroke,width = 1) {
  pen.beginPath();
  pen.ellipse(x,y,rx,ry,0,0,Math.PI*2);
  if (fill) {pen.fillStyle = fill; pen.fill();}
  if (stroke) {pen.strokeStyle = stroke; pen.lineWidth = width; pen.stroke();}
 }
 function glow(x, y, radius, color) {
  const fade = pen.createRadialGradient(x, y, 0, x, y, radius);
  fade.addColorStop(0, color);
  fade.addColorStop(1, '#ffffff00');
  oval(x, y, radius, radius, fade);
 }
 function ripple(x, y, length, rise, color, width) {
  const sheen = pen.createLinearGradient(x,y,x+length,y);
  sheen.addColorStop(0,'#ffffff00');
  sheen.addColorStop(.4,color);
  sheen.addColorStop(1,'#ffffff00');
  pen.beginPath();
  pen.moveTo(x,y);
  pen.quadraticCurveTo(x+length*.47,y-rise,x+length,y);
  pen.strokeStyle = sheen;
  pen.lineWidth = width;
  pen.stroke();
 }
 function box(x,y,w,d,h, top, west, east, z = 0) {
  material([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]],west,'#fff1cc52','#3c34423d');
  material([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]],east,'#ffd6a82b','#242a465c');
  material([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],top,'#fff5d633','#5d463527');
 }
 function randomFor(seed) {
  return () => {
   seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
   return seed / 4294967296;
  };
 }

 const townPalettes = [
  {front:'#e2bd87',side:'#ad785f',roof:'#c95b43',shade:'#a84339',trim:'#ef8a59'},
  {front:'#f5cf96',side:'#bd9076',roof:'#527e87',shade:'#3d5f6e',trim:'#82a7a4'},
  {front:'#f3af74',side:'#b46e58',roof:'#b74d43',shade:'#853c3e',trim:'#e57d53'},
  {front:'#e5d197',side:'#ae9e6f',roof:'#457d73',shade:'#3a615d',trim:'#83a48a'},
  {front:'#efd9a6',side:'#b9997d',roof:'#d0814d',shade:'#ac5c40',trim:'#f0b46b'},
  {front:'#dca58e',side:'#ab756f',roof:'#60758a',shade:'#455970',trim:'#8a98ae'},
 ];
 function house(x,y,w,d,h, colors, sign = false) {
  const ridge = 13 + w*11;
  const [shadowX, shadowY] = project(x + w * .76, y + d * .66);
  pen.save();
  pen.translate(shadowX + h * .27, shadowY + h * .12);
  pen.scale(1, .43);
  glow(0, 0, 15 + w * 16 + h * .17, '#182f4a85');
  pen.restore();
  plane([[x,y+.12],[x+w+.18,y+.12],[x+w+.24,y+d+.12],[x+.05,y+d+.12]],'#25405072');
  box(x,y,w,d,h,'#eed2aa',colors.front,colors.side);
  const left=x-.075, right=x+w+.075, back=y-.085, front=y+d+.085, middle=x+w/2;
  material([[x,y+d,h],[x+w,y+d,h],[middle,y+d,h+ridge]],colors.front,'#68616d33','#6a3b433e');
  material([[left,back,h],[middle,back,h+ridge],[middle,front,h+ridge],[left,front,h]],colors.roof,'#fff6c473','#49334a44');
  material([[middle,back,h+ridge],[right,back,h],[right,front,h],[middle,front,h+ridge]],colors.shade,'#fbd7a94f','#262c474d');
  for(let stripe=1;stripe<6;stripe++){
   const row=back+(front-back)*stripe/6;
   worldLine([[left,row,h+.3],[middle,row,h+ridge+.3]],'#ffb68c45',.7);
   worldLine([[middle,row,h+ridge+.3],[right,row,h+.3]],'#3c2e431f',.9);
  }
  for(let tile=1;tile<4;tile++){
   const fraction=tile/4, lift=h+ridge*fraction;
   worldLine([[left+(middle-left)*fraction,back,lift],[left+(middle-left)*fraction,front,lift]],'#552b4429',.85);
   worldLine([[right-(right-middle)*fraction,back,lift],[right-(right-middle)*fraction,front,lift]],'#49314138',.85);
  }
  worldLine([[middle,back,h+ridge],[middle,front,h+ridge]],colors.trim,2);
  worldLine([[left,front,h],[middle,front,h+ridge],[right,front,h]],colors.trim,1.5);
  const rows = h > 45 ? [10,28] : [9];
  rows.forEach((bottom,row) => {
   const columns = w>.62 ? 2 : 1;
   for(let i=1;i<=columns;i++){
    const center=x+w*i/(columns+1), win=Math.min(.16,w*.33);
    const width=(z,dx)=>[center+dx,y+d+.008,z+bottom];
    plane([width(-1,-win*.67),width(-1,win*.67),width(10,win*.67),width(10,-win*.67)],'#5d5049');
    material([width(0,-win*.5),width(0,win*.5),width(8,win*.5),width(8,-win*.5)],row % 2 ? '#ebca7c':'#ffe394','#fff8d79e','#b6855485');
    worldLine([width(0,0),width(8,0)],'#795848',.75);
    worldLine([width(3.5,-win*.5),width(3.5,win*.5)],'#8c654a',.75);
    worldLine([width(-1.5,-win*.72),width(-1.5,win*.72)],'#fff1c0a0',1.5);
   }
   if(d>.54){
    const winY=y+d*.48;
    plane([[x+w+.01,winY-.11,bottom],[x+w+.01,winY+.11,bottom],[x+w+.01,winY+.11,bottom+8],[x+w+.01,winY-.11,bottom+8]],'#85634d');
    plane([[x+w+.012,winY-.077,bottom+1],[x+w+.012,winY+.077,bottom+1],[x+w+.012,winY+.077,bottom+7],[x+w+.012,winY-.077,bottom+7]],'#f5b561');
   }
  });
  if(sign){
   const frontY=y+d, top=17, span=5;
   const awnings=['#f5dec0',colors.roof];
   for(let i=0;i<span;i++){
    const start=x+w*i/span, next=x+w*(i+1)/span;
    plane([[start,frontY,top],[next,frontY,top],[next,frontY+.24,top-5],[start,frontY+.24,top-5]],awnings[i%2]);
    plane([[start,frontY+.24,top-5],[next,frontY+.24,top-5],[next,frontY+.24,top-8],[start,frontY+.24,top-8]],awnings[i%2]);
   }
   plane([[x+w*.38,frontY+.01,0],[x+w*.65,frontY+.01,0],[x+w*.65,frontY+.01,13],[x+w*.38,frontY+.01,13]],'#6a5148');
  }
 }
 function tree(x,y,size,variant = 0) {
  const [a,b]=project(x,y);
  oval(a+4,b+2,size*.90,size*.28,'#1b485459');
  line([[a,b],[a+1,b-size*1.32]],'#715a46',size*.22);
  const colors=variant ? ['#2b6259','#51846a','#7da273'] : ['#315e59','#467f64','#72a377'];
  const canopy = pen.createRadialGradient(a-size*.37,b-size*1.73,0,a,b-size*1.28,size*1.2);
  canopy.addColorStop(0,colors[2]);
  canopy.addColorStop(.57,colors[1]);
  canopy.addColorStop(1,colors[0]);
  oval(a,b-size*1.22,size*.89,size,canopy);
  oval(a-size*.6,b-size*1.48,size*.35,size*.46,canopy);
  oval(a+size*.42,b-size*1.66,size*.39,size*.53,canopy);
 }
 function lamp(x,y){
  const [a,b]=project(x,y);
  oval(a+1,b+2,4,1.4,'#785a4a');
  line([[a,b],[a,b-17]],'#3f5857',2);
  glow(a,b-18,10,'#fff1bd77');
  oval(a,b-18,2.8,2.6,'#ffde8c');
  line([[a-2.5,b-20.8],[a+2.5,b-20.8]],'#425751',1.5);
 }
 function lighthouse(x,y){
  const [a,b]=project(x,y);
  oval(a+13,b+9,33,10,'#25394960');
  oval(a,b+4,29,13,'#a58466');
  oval(a,b-1,29,12,'#f3d4a4','#fff0c8',1.3);
  glow(a-3,b-140,57,'#ffed9255');
  const stripeColors=[['#fff2cf','#c9ac8b'],['#f48b64','#a83f38']];
  for(let i=0;i<6;i++){
   const widthBottom=19-i*1.52, widthTop=widthBottom-1.52, base=b-4-i*20, upper=base-20;
   const [light, shade]=stripeColors[i%2];
   const glaze = pen.createLinearGradient(a-widthBottom,0,a+widthBottom,0);
   glaze.addColorStop(0,shade);
   glaze.addColorStop(.32,light);
   glaze.addColorStop(.58,light);
   glaze.addColorStop(1,shade);
   oval(a,base,widthBottom,3.4,glaze);
   polygon([[a-widthBottom,base],[a+widthBottom,base],[a+widthTop,upper],[a-widthTop,upper]],glaze);
  }
  oval(a,b-124,18,6,'#ae483e');
  oval(a,b-128,18,6,'#f9c77b');
  polygon([[a-12,b-130],[a+12,b-130],[a+11,b-149],[a-11,b-149]],'#4a5c60');
  polygon([[a-8,b-132],[a+8,b-132],[a+7,b-147],[a-7,b-147]],'#ffe09a');
  line([[a-1,b-133],[a-1,b-147]],'#875742',1.7);
  polygon([[a-16,b-149],[a+16,b-149],[a+9,b-157],[a,b-161],[a-9,b-157]],'#bc503f');
  line([[a-15,b-149],[a+15,b-149]],'#f2925e',2);
  line([[a,b-159],[a,b-172]],'#6d5447',1.5);
  oval(a,b-172,2.6,2.6,'#f8cc79');
  oval(a-3,b-81,3,5,'#725450');oval(a-3,b-82,1.6,3.7,'#ffe48f');
  oval(a-4,b-10,4,8,'#9c7259');
 }
 function dock(x,y,length,vertical){
  const w=vertical ? .33 : length, d=vertical ? length : .35;
  box(x,y,w,d,4,'#b98c59','#745850','#614f4a',-4);
  for(let i=.12;i<length;i+=.13){
   if(vertical) worldLine([[x,y+i,1],[x+w,y+i,1]],'#795d4d99',.8);
   else worldLine([[x+i,y,1],[x+i,y+d,1]],'#795d4d99',.8);
  }
  for(let i=.12;i<length;i+=.72){
   if(vertical) box(x+.29,y+i,.07,.07,11,'#edbb7b','#88694c','#694c42',-7);
   else box(x+i,y+.31,.07,.07,11,'#edbb7b','#88694c','#694c42',-7);
  }
 }
 function sailboat(x,y,size,color,flip=1) {
  const [a,b] = project(x,y,-22);
  pen.save();
  pen.translate(a,b);
  pen.scale(size*flip,size);
  oval(8,6,25,4,'#032d4259');
  ripple(-26,16,41,1.7,'#dcf7e064',1);
  ripple(-21,20,34,1.3,'#abe8d23b',.8);
  line([[-38,10],[-22,9],[-9,10],[7,12],[19,10]],'#97e2dc66',1.2);
  line([[-25,15],[-13,15],[-1,17],[10,16]],'#79dbd26b',.9);
  polygon([[-23,1],[23,-3],[18,6],[8,10],[-11,10]],'#17445a');
  polygon([[-24,-2],[22,-5],[16,2],[7,6],[-15,6]],color);
  line([[-22,-2],[22,-5]],'#fff0c9',1.5);
  polygon([[-16,-3],[18,-4],[6,-7],[-7,-7]],'#d7b58e');
  line([[0,-5],[0,-43]],'#665748',1.7);
  const canvas = pen.createLinearGradient(-18,0,13,0);
  canvas.addColorStop(0,'#d3aa79');
  canvas.addColorStop(.44,'#fff7db');
  canvas.addColorStop(.67,'#f8e4b8');
  canvas.addColorStop(1,'#c29773');
  polygon([[-2,-42],[-18,-9],[-2,-9]],canvas);
  polygon([[2,-38],[2,-10],[15,-11]],canvas);
  line([[-2,-37],[-14,-13]],'#fff8e785',.9);
  line([[3,-32],[11,-14]],'#ae836670',.8);
  line([[-14,-13],[-3,-13]],'#bca991',.8);
  polygon([[0,-43],[12,-42],[7,-38],[0,-39]],color);
  pen.restore();
 }
 function fishingBoat(x,y){
  const [a,b] = project(x,y,-22);
  polygon([[a-22,b],[a+19,b-9],[a+17,b+1],[a+7,b+8],[a-10,b+9]],'#502e35');
  polygon([[a-20,b-3],[a+21,b-12],[a+16,b-5],[a+6,b+3],[a-13,b+4]],'#cf6d50');
  polygon([[a-15,b-5],[a+17,b-11],[a+6,b-4],[a-8,b]],'#d6b486');
  box(x-.13,y-.05,.27,.29,12,'#e9d0ad','#f0ce90','#976e57',-25);
  line([[a-22,b-3],[a+20,b-11]],'#ffe2b0',1);
 }


 const random=randomFor(14927);
 const ocean=pen.createRadialGradient(435,245,65,610,345,745);
 ocean.addColorStop(0,'#4eb8b6');ocean.addColorStop(.35,'#217d8c');ocean.addColorStop(.67,'#16536a');ocean.addColorStop(1,'#112e48');
 pen.fillStyle=ocean;
 pen.fillRect(-2000,-2000,5200,5200);
 for(let i=0;i<850;i++){
  const x=random()*1450-135, y=random()*740-58;
  const length=8+Math.pow(random(),2.5)*69;
  const bright=random()>.78;
  const phase=Math.sin(x*.012+y*.028)+Math.cos(x*.016-y*.012);
  if(phase>-.28 || i%6===0) {
   ripple(x-3,y+1.6,length*1.14,2.8,'#082f5840',1.7);
   ripple(x,y,length,2.6,bright?'#b5eee78c':'#87d9de46',bright?1.25:.75);
  }
 }
 // The solid underlay keeps the waterfront and the raised course visually continuous.
 plane([[-1.14,-1.08,-36],[11.36,-1.08,-36],[11.36,11.28,-36],[-1.14,11.28,-36]],'#112f5840');
 plane([[-1.05,-.96,-30],[11.07,-.96,-30],[11.09,11.11,-30],[-1.05,11.04,-30]],'#86dcd95c');
 plane([[-.92,-.83,-27],[10.98,-.83,-27],[10.98,10.98,-27],[-.92,10.91,-27]],'#1d687a','#bbe9dca0',1.8);
 box(-.72,-.72,11.44,11.44,30,'#ead8b2','#666b70','#4c5c6b',-32);
 box(-.72,-.72,11.44,11.44,5,'#e0c698','#9f8272','#776571',-6);
 worldLine([[-.72,10.73,-7],[10.72,10.73,-7],[10.73,-.72,-7]],'#efcbb27a',.95);
 worldLine([[-.72,10.73,-20],[10.72,10.73,-20],[10.73,-.72,-20]],'#2d455b8a',1.6);
 for(let i=-.66;i<10.65;i+=.29){
  worldLine([[i,10.725,-29],[i+.08,10.725,-15]],'#98a09a65',1.3);
  worldLine([[10.725,i,-28],[10.725,i+.08,-16]],'#8da29b4b',1.15);
 }
 plane([[-.57,-.57,-.8],[10.57,-.57,-.8],[10.57,10.57,-.8],[-.57,10.57,-.8]],'#594e48');
 const basin=[[.48,.48,-1],[9.52,.48,-1],[9.52,9.52,-1],[.48,9.52,-1]];
 const water=pen.createRadialGradient(460,275,42,545,354,460);
 water.addColorStop(0,'#71c9b7');water.addColorStop(.41,'#399fa4');water.addColorStop(1,'#216879');
 plane(basin, water,'#65544a',2);
 for(let i=0;i<170;i++){
  const x=.72+random()*8.56,y=.72+random()*8.56;
  const [a,b]=project(x,y);
  const w=2+random()*12;
  ripple(a,b,w*1.7,1.9,i%5===0?'#e9fff7b3':'#b1eadb7b',i%5===0?1.35:.85);
 }
 const coast='#ddbe93', lip='#f4d6a6';
 const northLot=[[.55,.55],[9.43,.55],[9.43,3.12],[8.95,3.12],[8.8,3.64],[7.65,3.64],[7.51,4.27],[5.66,4.27],[5.59,4.91],[3.72,4.91],[3.5,5.45],[.55,5.45]];
 const southLot=[[9.44,4.99],[8.79,4.99],[8.62,5.52],[7.12,5.52],[6.99,6.1],[5.56,6.1],[5.49,6.71],[3.85,6.71],[3.8,7.4],[2.6,7.4],[2.6,7.9],[.55,7.9],[.55,9.48],[9.44,9.48]];
 for(const lot of [northLot,southLot]){
  plane(lot.map(([x,y])=>[x+.075,y+.08,-6]),'#24556b78','#a6e4d67a',3.5);
  plane(lot.map(([x,y])=>[x+.025,y+.035,-3]),'#54737a');
  const surface=lot.map(([x,y])=>[x,y,3]);
  material(surface,coast,'#fff3ce84','#8b674851');
  plane(surface,null,lip,1.6);
 }
 plane([[.74,.73,3.1],[9.28,.73,3.1],[9.26,1.91,3.1],[.74,1.91,3.1]],'#c1a988');
 plane([[.70,8.67,3.1],[9.28,8.67,3.1],[9.28,9.23,3.1],[.70,9.23,3.1]],'#c4ae8a');
 const parks=[
  [[.78,3.69,3.5],[3.52,3.69,3.5],[3.49,4.91,3.5],[2.63,5.25,3.5],[.78,5.25,3.5]],
  [[5.71,6.41,3.5],[8.8,6.02,3.5],[8.96,7.54,3.5],[5.73,7.78,3.5]],
 ];
 for(const park of parks){
  material(park,'#a5ab7f','#fbefb260','#52695c38');
  plane(park,null,'#f2dfb5',1.45);
 }
 for(let x=.9;x<9.3;x+=.27){
  worldLine([[x,.76,3.2],[x,1.06,3.2]],'#836c5866',.65);
  worldLine([[x,9,3.2],[x,9.28,3.2]],'#836c5866',.65);
 }
 for(let i=0;i<228;i++){
  const x=.63+random()*8.71,y=.63+random()*8.71;
  const inQuay= y< (x<3.5 ? 5.38 : x<5.55 ? 4.84 : x<7.5 ? 4.2 : x<8.75 ? 3.55 : 3.03)
    || y>(x<2.6 ? 7.95:x<3.8?7.49:x<5.5?6.8:x<7?6.19:x<8.62?5.59:5.08);
  if(inQuay){
   worldLine([[x,y,3.2],[x+.12,y,3.2]],i%2?'#a78f755e':'#ffecd668',.7);
  }
 }
 // Jetties and boats retain their positions as the pieces move.
 dock(2.91,5.42,1.48,true);dock(7.83,3.58,1.21,true);dock(8.02,5.41,.88,false);
 dock(-1.94,7.66,1.22,false);dock(10.73,3.48,1.04,false);
 sailboat(1.14,6.68,.91,'#bb493f');
 sailboat(4.9,5.86,.79,'#b34f40',-1);
 fishingBoat(8.88,4.32);
 sailboat(-2.12,3.63,.92,'#f6a15f',-1);
 sailboat(4.57,-1.85,.68,'#b44a46');
 sailboat(11.59,7.86,1.02,'#f2ae5c',-1);
 sailboat(7.59,11.64,.63,'#f1aa69',-1);
 sailboat(1.15,11.91,.75,'#f08e63');
 const props=[];
 const add = (x,y,draw) => props.push({depth:x+y,draw});
 const buildings=[
  [.95,1.1,.7,.63,24,3],[1.76,1.1,.66,.68,27,0],[2.54,1.1,.71,.59,27,1],[3.38,1.1,.83,.66,24,2],[5.1,1.1,.83,.71,26,3],[6.03,1.1,.64,.61,29,5],[6.78,1.1,.83,.66,29,2],[7.75,1.1,1.14,.7,23,4],
  [3.06,2.12,.73,.71,39,2],[3.89,2.12,.7,.73,35,4],[4.7,2.05,.77,.81,49,5],[5.58,2.04,.76,.81,28,0],[6.53,2.09,.85,.80,52,3],[7.49,2.11,.78,.71,32,2],[8.4,2.08,.68,.72,46,1],
  [1.14,2.52,.86,.74,33,1],[2.21,2.51,.65,.66,43,4],[3.76,3.22,.63,.75,46,0],[4.58,3.19,.83,.75,34,3],[5.49,3.18,.67,.8,45,4],[6.25,3.2,.97,.79,35,2],
  [1.05,8.38,.66,.65,24,0],[1.82,8.34,.68,.66,30,5],[2.74,8.47,.83,.74,44,0],[3.71,8.48,.72,.66,27,3],[4.58,8.26,.88,.73,40,4],[5.61,8.33,.75,.75,46,1],[6.49,8.32,.72,.75,31,2],[7.39,8.27,.75,.74,42,0],[8.28,8.22,.82,.9,53,5],
  [4.06,7.19,.82,.76,39,2],[5.02,6.99,.69,.67,33,4],[6.12,6.53,.71,.67,37,5],[7.01,6.2,.70,.71,31,3],[7.83,6.14,.82,.81,42,0],[8.78,5.36,.43,.77,31,1],
 ];
 buildings.forEach(([x,y,w,d,h,p],i)=>add(x+w,y+d,()=>house(x,y,w,d,h,townPalettes[p],i%3===1||y>8)));
 const trees=[
  [.81,2.13,11],[1.07,4.86,13],[2.63,4.76,12],[2.76,5.13,8],[3.17,4.41,11],[2.88,3.7,8],
  [8.97,.98,10],[9.14,2.51,8],[7.85,3.25,9],[.86,8.21,9],[2.4,8.06,10],[3.34,7.84,9],
  [5.73,7.38,10],[6.71,7.3,14],[6.31,7.44,8],[7.1,7.24,9],[8.87,7.32,13],[9.1,7.85,8],[9.13,8.98,9],
 ];
 trees.forEach(([x,y,size],i)=>add(x,y,()=>tree(x,y,size,i%3===1)));
 [[1.4,5.22],[3.45,5.24],[4.88,4.71],[5.36,4.69],[6.77,4.07],[8.45,3.42],[8.39,5.72],[6.76,6.24],[3.54,7.57],[2.14,7.98],[1.09,9.34],[4.17,9.28],[7.4,9.24]].forEach(([x,y])=>add(x,y,()=>lamp(x,y)));
 add(3.7,4.69,()=>lighthouse(3.7,4.69));
 props.sort((a,b)=>a.depth-b.depth).forEach(prop=>prop.draw());

 pen.restore();
}
