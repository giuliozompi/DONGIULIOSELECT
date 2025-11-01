import { YandexGoService } from './server/services/yandex-go';

async function testYandexGo() {
  console.log('🧪 Testing Yandex Go with static token...\n');
  
  const yandexGoService = new YandexGoService();
  
  // Test coordinates (Moscow area)
  const testRequest = {
    items: [{
      quantity: 1,
      weight: 2, // kg
      size: {
        length: 0.3, // m
        width: 0.2,  // m
        height: 0.15 // m
      }
    }],
    route_points: [
      {
        coordinates: [37.617635, 55.755814] as [number, number], // Kremlin
        fullname: 'Москва, Красная площадь, 1'
      },
      {
        coordinates: [37.620393, 55.753215] as [number, number], // Bolshoi Theatre
        fullname: 'Москва, Театральная площадь, 1'
      }
    ],
    requirements: {
      taxi_classes: ['express']
    }
  };
  
  try {
    console.log('📍 Pickup: Красная площадь');
    console.log('📍 Delivery: Театральная площадь\n');
    
    console.log('🚀 Calling Yandex Go API...\n');
    const priceInfo = await yandexGoService.checkPrice(testRequest);
    
    console.log('✅ SUCCESS! Token is working!\n');
    console.log('Response:', JSON.stringify(priceInfo, null, 2));
    
  } catch (error) {
    console.error('❌ ERROR:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  }
}

testYandexGo();
