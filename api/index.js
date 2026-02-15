const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ============================================
// KONFIGURASI
// ============================================
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY || '';
const UNIVERSE_IDS = process.env.UNIVERSE_IDS 
    ? process.env.UNIVERSE_IDS.split(',').map(id => id.trim())
    : [];
const UNIVERSE_ID_1 = process.env.UNIVERSE_ID_1 || '';
const UNIVERSE_ID_2 = process.env.UNIVERSE_ID_2 || '';

const ALL_UNIVERSE_IDS = UNIVERSE_IDS.length > 0 
    ? UNIVERSE_IDS 
    : [UNIVERSE_ID_1, UNIVERSE_ID_2].filter(id => id);

const DATASTORE_NAME = 'SociaBuzzDonations'; // ✅ CHANGED
const DATASTORE_KEY = 'AllDonations';

// Queue untuk game server
let donationQueue = [];

console.log('╔════════════════════════════════════════╗');
console.log('║  SociaBuzz Backend - Multi-Universe   ║'); // ✅ CHANGED
console.log('╚════════════════════════════════════════╝');
console.log('Universe IDs:', ALL_UNIVERSE_IDS.length);
ALL_UNIVERSE_IDS.forEach((id, idx) => console.log(`  ${idx + 1}. ${id}`));
console.log('═══════════════════════════════════════════\n');

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateMD5(content) {
    const hash = crypto.createHash('md5');
    hash.update(content);
    return hash.digest('base64');
}

async function getDataStoreValue(universeId, datastoreName, entryKey) {
    try {
        const url = `https://apis.roblox.com/datastores/v1/universes/${universeId}/standard-datastores/datastore/entries/entry`;
        
        console.log(`📖 GET [U:${universeId}] ${datastoreName}/${entryKey}`);
        
        const response = await axios.get(url, {
            params: {
                datastoreName: datastoreName,
                entryKey: entryKey
            },
            headers: {
                'x-api-key': ROBLOX_API_KEY
            },
            timeout: 15000
        });
        
        console.log(`✅ GET OK [U:${universeId}]`);
        return response.data;
        
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log(`ℹ️  Not found [U:${universeId}], returning []`);
            return [];
        }
        console.error(`❌ GET Error [U:${universeId}]:`, error.response?.data || error.message);
        throw error;
    }
}

async function setDataStoreValue(universeId, datastoreName, entryKey, value) {
    try {
        const url = `https://apis.roblox.com/datastores/v1/universes/${universeId}/standard-datastores/datastore/entries/entry`;
        
        const jsonString = JSON.stringify(value);
        const md5Hash = generateMD5(jsonString);
        
        console.log(`💾 POST [U:${universeId}] ${datastoreName}/${entryKey} (${jsonString.length} bytes)`);
        
        const response = await axios.post(url, 
            jsonString,
            {
                params: {
                    datastoreName: datastoreName,
                    entryKey: entryKey
                },
                headers: {
                    'x-api-key': ROBLOX_API_KEY,
                    'content-type': 'application/json',
                    'content-md5': md5Hash,
                    'roblox-entry-userids': '[]',
                    'roblox-entry-attributes': '{}'
                },
                timeout: 15000
            }
        );
        
        console.log(`✅ POST OK [U:${universeId}] v${response.data.version}`);
        return response.data;
        
    } catch (error) {
        console.error(`❌ POST Error [U:${universeId}]:`, error.response?.status, error.response?.data || error.message);
        throw error;
    }
}

async function saveDonationToAllUniverses(donationData) {
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║  SAVING TO ALL UNIVERSES              ║`);
    console.log(`╚════════════════════════════════════════╝`);
    console.log(`Platform: SociaBuzz`); // ✅ CHANGED
    console.log(`Donor: ${donationData.nama}`);
    console.log(`Amount: Rp ${donationData.amount.toLocaleString('id-ID')}`);
    console.log(`Message: "${donationData.message}"`);
    console.log(`Universes: ${ALL_UNIVERSE_IDS.length}`);
    
    const results = [];
    
    for (let i = 0; i < ALL_UNIVERSE_IDS.length; i++) {
        const universeId = ALL_UNIVERSE_IDS[i];
        
        console.log(`\n--- Universe ${i + 1}/${ALL_UNIVERSE_IDS.length}: ${universeId} ---`);
        
        try {
            let allDonations = await getDataStoreValue(universeId, DATASTORE_NAME, DATASTORE_KEY);
            
            if (!Array.isArray(allDonations)) {
                console.log('⚠️  Initializing array');
                allDonations = [];
            }
            
            console.log(`Current donors: ${allDonations.length}`);
            
            const donorName = donationData.nama;
            const donationAmount = parseInt(donationData.amount) || 0;
            const donationMessage = donationData.message || '';
            const donationTimestamp = donationData.timestamp || new Date().toISOString();
            
            const existingIndex = allDonations.findIndex(d => d.Name === donorName);
            
            if (existingIndex !== -1) {
                const donor = allDonations[existingIndex];
                const oldAmount = donor.Amount;
                const newAmount = oldAmount + donationAmount;
                
                donor.Amount = newAmount;
                
                if (!Array.isArray(donor.Messages)) {
                    donor.Messages = [];
                }
                
                donor.Messages.push({
                    Message: donationMessage,
                    Amount: donationAmount,
                    Timestamp: donationTimestamp
                });
                
                donor.DonationCount = donor.Messages.length;
                donor.LastDonation = donationTimestamp;
                
                console.log(`✅ UPDATED: ${donorName}`);
                console.log(`   ${oldAmount.toLocaleString()} + ${donationAmount.toLocaleString()} = ${newAmount.toLocaleString()}`);
                console.log(`   Messages: ${donor.Messages.length}`);
            } else {
                const newDonor = {
                    Name: donorName,
                    Amount: donationAmount,
                    DonationCount: 1,
                    LastDonation: donationTimestamp,
                    Messages: [
                        {
                            Message: donationMessage,
                            Amount: donationAmount,
                            Timestamp: donationTimestamp
                        }
                    ]
                };
                
                allDonations.push(newDonor);
                console.log(`✅ ADDED: ${donorName} - Rp ${donationAmount.toLocaleString('id-ID')}`);
            }
            
            await setDataStoreValue(universeId, DATASTORE_NAME, DATASTORE_KEY, allDonations);
            
            const totalAmount = allDonations.reduce((sum, d) => sum + d.Amount, 0);
            const totalMessages = allDonations.reduce((sum, d) => sum + (d.Messages?.length || 0), 0);
            
            console.log(`💾 SAVED! Donors: ${allDonations.length}, Total: Rp ${totalAmount.toLocaleString('id-ID')}, Messages: ${totalMessages}`);
            
            results.push({
                universeId: universeId,
                success: true,
                totalDonors: allDonations.length,
                totalAmount: totalAmount,
                totalMessages: totalMessages,
                updated: existingIndex !== -1
            });
            
        } catch (error) {
            console.error(`❌ FAILED [U:${universeId}]: ${error.message}`);
            
            results.push({
                universeId: universeId,
                success: false,
                error: error.message
            });
        }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║  SUMMARY: ${successCount}/${ALL_UNIVERSE_IDS.length} Universes Updated        ║`);
    console.log(`╚════════════════════════════════════════╝\n`);
    
    return {
        totalUniverses: ALL_UNIVERSE_IDS.length,
        successCount: successCount,
        failedCount: ALL_UNIVERSE_IDS.length - successCount,
        results: results,
        allSuccess: successCount === ALL_UNIVERSE_IDS.length
    };
}

// ============================================
// WEBHOOK ENDPOINT - SOCIABUZZ FORMAT
// ============================================

app.post('/api/sociabuzz', async (req, res) => { // ✅ CHANGED
    console.log('\n🎁 SOCIABUZZ WEBHOOK RECEIVED'); // ✅ CHANGED
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    try {
        // ✅ SOCIABUZZ FORMAT MAPPING
        const donationData = {
            nama: req.body.supporter_name || req.body.name || 'Anonymous', // SociaBuzz uses "supporter_name"
            amount: parseInt(req.body.amount) || 0, // SociaBuzz directly sends "amount"
            message: req.body.supporter_message || req.body.message || 'Terima kasih atas dukungannya!', // SociaBuzz uses "supporter_message"
            timestamp: req.body.created_at || new Date().toISOString(),
            id: req.body.id || Date.now().toString(),
            email: req.body.supporter_email || req.body.email || '' // SociaBuzz uses "supporter_email"
        };
        
        if (!donationData.nama || donationData.amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid donation'
            });
        }
        
        console.log(`Donation: ${donationData.nama} - Rp ${donationData.amount.toLocaleString('id-ID')}`);
        
        let datastoreResult = { allSuccess: false };
        
        if (ROBLOX_API_KEY && ALL_UNIVERSE_IDS.length > 0) {
            datastoreResult = await saveDonationToAllUniverses(donationData);
        } else {
            console.warn('⚠️  No configuration');
        }
        
        donationQueue.push(donationData);
        
        res.status(200).json({
            success: true,
            message: datastoreResult.allSuccess
                ? 'Saved to all Universes with message history'
                : `Saved to ${datastoreResult.successCount}/${datastoreResult.totalUniverses} Universes`,
            data: donationData,
            datastore: datastoreResult
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ✅ CHANGED: Endpoint untuk Roblox polling
app.get('/api/sociabuzz/get-donations', (req, res) => {
    const donations = [...donationQueue];
    donationQueue = [];
    res.json({ success: true, donations: donations });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK',
        timestamp: new Date().toISOString(),
        platform: 'SociaBuzz', // ✅ CHANGED
        version: '2.2.0',
        openCloud: {
            configured: !!(ROBLOX_API_KEY && ALL_UNIVERSE_IDS.length > 0),
            totalUniverses: ALL_UNIVERSE_IDS.length,
            universeIds: ALL_UNIVERSE_IDS,
            hasApiKey: !!ROBLOX_API_KEY
        },
        datastore: DATASTORE_NAME,
        queue: donationQueue.length
    });
});

app.get('/api', (req, res) => {
    res.json({ 
        name: 'SociaBuzz Webhook API', // ✅ CHANGED
        version: '2.2.0',
        platform: 'SociaBuzz', // ✅ CHANGED
        endpoints: {
            webhook: 'POST /api/sociabuzz', // ✅ CHANGED
            getDonations: 'GET /api/sociabuzz/get-donations', // ✅ CHANGED
            health: 'GET /api/health'
        }
    });
});

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
});

module.exports = app;
