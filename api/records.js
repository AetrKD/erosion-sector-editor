// Older clients must not continue uploading detailed mission logs.
export default function handler(req,res){res.setHeader('Cache-Control','no-store');res.status(410).json({error:'Detailed mission records are retired. Update Erosion Sector to use personal stage clears.'});}
