// Test Yandex Taxi Business API (Fleet Management)
// Docs: https://yandex.ru/dev/taxi/taxicorp/

async function testYandexTaxiBusiness() {
  console.log('🚕 Testing Yandex Taxi Business API...\n');
  
  const token = process.env.YANDEX_GO_TOKEN;
  
  if (!token) {
    console.error('❌ YANDEX_GO_TOKEN not found');
    return;
  }
  
  console.log('🔑 Token found:', token.substring(0, 20) + '...\n');
  
  // Prova 1: API Taxi Business - Endpoint drivers (se ha accesso fleet)
  const testEndpoints = [
    {
      name: 'Taxi Business - Drivers List',
      url: 'https://b2b-api.go.yandex.ru/v1/parks/drivers',
      method: 'GET'
    },
    {
      name: 'Taxi Business - Orders List', 
      url: 'https://b2b-api.go.yandex.ru/v1/orders',
      method: 'GET'
    },
    {
      name: 'Cargo API - Health Check',
      url: 'https://b2b.taxi.yandex.net/b2b/cargo/integration/v2/ping',
      method: 'GET'
    }
  ];
  
  for (const endpoint of testEndpoints) {
    console.log(`\n📡 Testing: ${endpoint.name}`);
    console.log(`   URL: ${endpoint.url}`);
    
    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Accept-Language': 'ru'
        }
      });
      
      const status = response.status;
      const statusText = response.statusText;
      const body = await response.text();
      
      console.log(`   Status: ${status} ${statusText}`);
      
      if (status === 200) {
        console.log('   ✅ SUCCESS! Token works for this endpoint!');
        console.log('   Response:', body.substring(0, 200));
      } else if (status === 401 || status === 403) {
        console.log('   ❌ Authentication failed');
        console.log('   Response:', body);
      } else if (status === 404) {
        console.log('   ℹ️  Endpoint not found (may need different path)');
      } else {
        console.log('   Response:', body.substring(0, 200));
      }
      
    } catch (error) {
      console.log('   ❌ Error:', error instanceof Error ? error.message : error);
    }
  }
  
  // Prova anche endpoint semplice senza autenticazione per test
  console.log('\n\n📋 Token Analysis:');
  console.log('   Length:', token.length);
  console.log('   Starts with:', token.substring(0, 10));
  console.log('   Format:', token.startsWith('y0_') ? 'Yandex OAuth format' : 'Unknown format');
}

testYandexTaxiBusiness();
