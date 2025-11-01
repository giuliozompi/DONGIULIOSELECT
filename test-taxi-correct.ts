// Test Yandex Taxi Business API v1.0
// Base URL: https://business.taxi.yandex.ru
// Docs: https://yandex.ru/dev/taxi/doc/business-api/

async function testTaxiBusinessAPI() {
  console.log('🚕 Testing Yandex Taxi Business API v1.0\n');
  
  const token = process.env.YANDEX_GO_TOKEN;
  
  if (!token) {
    console.error('❌ YANDEX_GO_TOKEN not found');
    return;
  }
  
  // Test 1: GET client info (documentato)
  console.log('📡 Test 1: GET Client Info');
  console.log('   URL: https://business.taxi.yandex.ru/api/1.0/client\n');
  
  try {
    const response = await fetch('https://business.taxi.yandex.ru/api/1.0/client', {
      method: 'GET',
      headers: {
        'Authorization': `OAuth ${token}`, // Formato OAuth (non Bearer)
        'Accept': 'application/json',
        'Accept-Language': 'ru'
      }
    });
    
    const status = response.status;
    const body = await response.text();
    
    console.log(`   Status: ${status} ${response.statusText}`);
    
    if (status === 200) {
      console.log('   ✅ SUCCESS! Token funziona!');
      console.log('   Response:', JSON.stringify(JSON.parse(body), null, 2));
    } else {
      console.log('   Response:', body);
    }
    
  } catch (error) {
    console.error('   ❌ Error:', error);
  }
  
  // Test 2: POST estimate (richiede client_id, solo se Test 1 ha successo)
  console.log('\n\n📡 Test 2: POST Trip Estimate');
  console.log('   URL: https://business.taxi.yandex.ru/api/1.0/estimate\n');
  
  try {
    const estimateRequest = {
      route: [
        [37.617635, 55.755814], // Kremlin
        [37.620393, 55.753215]  // Bolshoi Theatre
      ],
      // Nota: serve anche client_id che si ottiene da /api/1.0/client
    };
    
    const response = await fetch('https://business.taxi.yandex.ru/api/1.0/estimate', {
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'ru'
      },
      body: JSON.stringify(estimateRequest)
    });
    
    const status = response.status;
    const body = await response.text();
    
    console.log(`   Status: ${status} ${response.statusText}`);
    console.log('   Response:', body.substring(0, 300));
    
  } catch (error) {
    console.error('   ❌ Error:', error);
  }
  
  // Test 3: Prova anche formato Bearer (per sicurezza)
  console.log('\n\n📡 Test 3: GET Client Info (con Bearer invece di OAuth)');
  console.log('   URL: https://business.taxi.yandex.ru/api/1.0/client\n');
  
  try {
    const response = await fetch('https://business.taxi.yandex.ru/api/1.0/client', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`, // Formato Bearer
        'Accept': 'application/json',
        'Accept-Language': 'ru'
      }
    });
    
    const status = response.status;
    const body = await response.text();
    
    console.log(`   Status: ${status} ${response.statusText}`);
    console.log('   Response:', body.substring(0, 200));
    
  } catch (error) {
    console.error('   ❌ Error:', error);
  }
}

testTaxiBusinessAPI();
