/**
 * Script to add addresses to gyms using Nominatim reverse geocoding
 * Run with: node scripts/addGymAddresses.js
 */

const fs = require('fs');
const path = require('path');

const GYMS_FILE = path.join(__dirname, '../data/gymsDK.json');
const DELAY_MS = 1100; // Nominatim rate limit: 1 request per second

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Gymly-App/1.0 (contact@gymly.dk)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.address) {
      const addr = data.address;
      const street = addr.road || addr.pedestrian || addr.footway || '';
      const number = addr.house_number || '';
      const city = addr.city || addr.town || addr.village || addr.municipality || '';
      const postcode = addr.postcode || '';
      
      let fullAddress = '';
      if (street) {
        fullAddress = number ? `${street} ${number}` : street;
        if (postcode && city) {
          fullAddress += `, ${postcode} ${city}`;
        } else if (city) {
          fullAddress += `, ${city}`;
        }
      }
      
      return fullAddress || null;
    }
    
    return null;
  } catch (error) {
    console.error(`  Error geocoding: ${error.message}`);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Loading gyms...');
  const gyms = JSON.parse(fs.readFileSync(GYMS_FILE, 'utf8'));
  
  const gymsWithoutAddress = gyms.filter(g => !g.address);
  console.log(`Found ${gymsWithoutAddress.length} gyms without addresses (total: ${gyms.length})`);
  
  let updated = 0;
  let failed = 0;
  
  for (let i = 0; i < gymsWithoutAddress.length; i++) {
    const gym = gymsWithoutAddress[i];
    const progress = `[${i + 1}/${gymsWithoutAddress.length}]`;
    
    console.log(`${progress} Geocoding: ${gym.name} (${gym.city || gym.region})`);
    
    const address = await reverseGeocode(gym.latitude, gym.longitude);
    
    if (address) {
      // Find and update the gym in the original array
      const originalGym = gyms.find(g => g.id === gym.id);
      if (originalGym) {
        originalGym.address = address;
        updated++;
        console.log(`  ✓ ${address}`);
      }
    } else {
      failed++;
      console.log(`  ✗ No address found`);
    }
    
    // Save every 50 gyms to prevent data loss
    if ((i + 1) % 50 === 0) {
      console.log('\nSaving progress...');
      fs.writeFileSync(GYMS_FILE, JSON.stringify(gyms, null, 2));
      console.log('Progress saved!\n');
    }
    
    // Rate limiting delay
    if (i < gymsWithoutAddress.length - 1) {
      await sleep(DELAY_MS);
    }
  }
  
  // Final save
  console.log('\nSaving final results...');
  fs.writeFileSync(GYMS_FILE, JSON.stringify(gyms, null, 2));
  
  console.log('\n=== DONE ===');
  console.log(`Updated: ${updated} gyms`);
  console.log(`Failed: ${failed} gyms`);
  console.log(`Total: ${gyms.length} gyms`);
}

main().catch(console.error);




