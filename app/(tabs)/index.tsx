import { useFocusEffect } from '@react-navigation/native';
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";

interface GameDeal {
  dealID: string;
  title: string;
  normalPrice: string;
  salePrice: string;
  savings: string;
  thumb: string;
  storeID: string;
  dealRating: string;
  gameID?: string;
  steamAppID?: string;
  isDLC?: boolean;
  isBundle?: boolean;
  type?: 'Game' | 'DLC' | 'Bundle';
  steamPriceVN?: {
    currency: string;
    initial: number;
    final: number;
    discount_percent: number;
    initial_formatted: string;
    final_formatted: string;
  };
}

interface GameDetail {
  info: {
    title: string;
    steamAppID: string;
    thumb: string;
  };
  deals: Array<{
    storeID: string;
    dealID: string;
    price: string;
    retailPrice: string;
    savings: string;
  }>;
  cheapestPriceEver: {
    price: string;
    date: number;
  };
  steamPriceVN?: {
    currency: string;
    initial: number;
    final: number;
    discount_percent: number;
    initial_formatted: string;
    final_formatted: string;
  };
  description?: string;
  screenshots?: Array<{
    id: number;
    path_thumbnail: string;
    path_full: string;
  }>;
  genres?: Array<{
    id: string;
    description: string;
  }>;
  developers?: string[];
  publishers?: string[];
}

type PriceFilter = 'all' | 'under100k' | '100k-500k' | '500k-1m' | 'over1m';

export default function HomeTab() {
  const [deals, setDeals] = useState<GameDeal[]>([]);
  const [filteredDeals, setFilteredDeals] = useState<GameDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(25000); // Default USD to VND rate
  const [selectedFilter, setSelectedFilter] = useState<PriceFilter>('all');
  const [showGameDetail, setShowGameDetail] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [allSteamGames, setAllSteamGames] = useState<any[]>([]);
  const [showRefreshNotification, setShowRefreshNotification] = useState(false);
  const lastFocusTime = useRef<number>(0);
  const isFocused = useRef<boolean>(false);

  // Store mapping với ưu tiên stores phổ biến tại Việt Nam
  const storeNames: { [key: string]: string } = {
    '1': 'Steam',
    '2': 'GamersGate', 
    '3': 'Green Man Gaming',
    '7': 'GOG',
    '8': 'Origin',
    '11': 'Humble Store',
    '13': 'Uplay',
    '15': 'Fanatical',
    '21': 'WinGameStore',
    '25': 'Epic Games Store',
    '27': 'GameBillet',
    '28': 'Voidu',
    '30': 'GamersFirst',
    '31': 'GamersPlanet US',
    '34': 'Indiegala Store'
  };

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      if (data.rates && data.rates.VND) {
        setExchangeRate(data.rates.VND);
      }
    } catch (error) {
      console.log('Sử dụng tỷ giá mặc định:', error);
    }
  };

  const fetchAllSteamSaleGames = async () => {
    try {
      // Lấy nhiều pages từ CheapShark để có đủ games
      const pagePromises = [];
      for (let i = 0; i < 10; i++) { // Lấy 10 pages = 600 games
        pagePromises.push(
          fetch(`https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&sortBy=Savings&desc=1&pageNumber=${i}&pageSize=60`)
        );
      }
      
      const responses = await Promise.all(pagePromises);
      const dataArrays = await Promise.all(responses.map(r => r.json()));
      
      // Flatten all games
      const allDeals = dataArrays.flat();
      
      console.log(`Fetched ${allDeals.length} total Steam deals`);
      
      // Convert to our format và PHÂN LOẠI GAME vs DLC
      const allGames = allDeals
        .filter(deal => parseFloat(deal.savings) >= 5) // Chỉ items có discount >= 5% (tránh lỗi làm tròn)
        .map(deal => {
          // Phân loại DLC vs Game vs Bundle
          const title = deal.title.toLowerCase();
          
          let contentType = 'Game'; // Default
          let isDLC = false;
          let isBundle = false;
          
          // Kiểm tra Bundle (game + DLC)
          if (title.includes('bundle') || 
              title.includes('complete edition') ||
              title.includes('definitive edition') ||
              title.includes('goty') || 
              title.includes('game of the year') ||
              title.includes('ultimate edition') ||
              title.includes('deluxe edition') ||
              title.includes('gold edition') ||
              (title.includes('edition') && title.includes('all'))) {
            contentType = 'Bundle';
            isBundle = true;
          }
          // Kiểm tra DLC
          else if (title.includes('dlc') || 
                   title.includes('expansion') || 
                   title.includes('season pass') ||
                   title.includes('add-on') ||
                   title.includes('downloadable content') ||
                   title.includes('pack') ||
                   title.includes(' - ') || // DLC thường có " - "
                   title.includes('chapter') ||
                   title.includes('episode')) {
            contentType = 'DLC';
            isDLC = true;
          }
          
          return {
            id: deal.steamAppID || deal.gameID,
            title: deal.title,
            dealID: deal.dealID,
            price: deal.salePrice,
            normalPrice: deal.normalPrice,
            savings: deal.savings,
            thumb: deal.thumb,
            isDLC: isDLC,
            isBundle: isBundle,
            type: contentType
          };
        });
      
      // Thống kê chi tiết
      const gameCount = allGames.filter(g => g.type === 'Game').length;
      const dlcCount = allGames.filter(g => g.type === 'DLC').length;
      const bundleCount = allGames.filter(g => g.type === 'Bundle').length;
      const totalSavings = allGames.reduce((sum, g) => sum + parseFloat(g.savings), 0);
      const avgSavings = totalSavings / allGames.length;
      
      // Thống kê discount theo loại
      const gameAvgSavings = allGames.filter(g => g.type === 'Game').reduce((sum, g) => sum + parseFloat(g.savings), 0) / gameCount;
      const dlcAvgSavings = allGames.filter(g => g.type === 'DLC').reduce((sum, g) => sum + parseFloat(g.savings), 0) / dlcCount;
      const bundleAvgSavings = allGames.filter(g => g.type === 'Bundle').reduce((sum, g) => sum + parseFloat(g.savings), 0) / bundleCount;
      
      console.log(`📊 THỐNG KÊ STEAM SALE CHI TIẾT (Discount >= 5%):`);
      console.log(`🎮 Games đang sale: ${gameCount} (avg: ${gameAvgSavings.toFixed(1)}%)`);
      console.log(`📦 DLC đang sale: ${dlcCount} (avg: ${dlcAvgSavings.toFixed(1)}%)`);
      console.log(`🎁 Bundles đang sale: ${bundleCount} (avg: ${bundleAvgSavings.toFixed(1)}%)`);
      console.log(`💰 Tổng discount trung bình: ${avgSavings.toFixed(1)}%`);
      
      // Remove duplicates and filter valid items with discount >= 5%
      const uniqueGames = allGames.filter((game, index, self) => 
        game.id && 
        parseFloat(game.savings) >= 5 && // Double check có discount >= 5%
        index === self.findIndex(g => g.id === game.id)
      );
      
      setAllSteamGames(uniqueGames);
      console.log(`Stored ${uniqueGames.length} unique Steam games`);
      return uniqueGames;
    } catch (error) {
      console.error('Error fetching all Steam games:', error);
      return [];
    }
  };

  const fetchSteamSaleGames = async (pageNum: number = 0, isRefresh: boolean = false) => {
    try {
      let saleGames = allSteamGames;
      
      // If refresh or no cached data, fetch new data
      if (isRefresh || saleGames.length === 0) {
        saleGames = await fetchAllSteamSaleGames();
      }
      
      // Pagination: 10 games mỗi page
      const startIndex = pageNum * 10;
      const endIndex = startIndex + 10;
      const pageGames = saleGames.slice(startIndex, endIndex);
      
      console.log(`Loading page ${pageNum}, games ${startIndex}-${endIndex}, total available: ${saleGames.length}`);
      
      if (pageGames.length === 0) {
        setHasMore(false);
        return [];
      }
      
      // Enrich với Steam VN prices - batch processing để faster
      const enrichedGames = await Promise.all(
        pageGames.map(async (game: any) => {
          try {
            // Lấy Steam VN price
            const steamPrice = await fetchSteamPrice(game.id);
            
            if (!steamPrice) {
              // Fallback to CheapShark data with VND conversion
              return {
                dealID: game.dealID || `steam_${game.id}`,
                title: game.title,
                normalPrice: game.normalPrice,
                salePrice: game.price,
                savings: game.savings,
                thumb: game.thumb,
                storeID: '1',
                dealRating: '0',
                gameID: game.id,
                steamAppID: game.id,
                isDLC: game.isDLC,
                isBundle: game.isBundle,
                type: game.type,
                steamPriceVN: undefined // Will use fallback display
              };
            }
            
            return {
              dealID: `steam_${game.id}`,
              title: game.title,
              normalPrice: (steamPrice.initial / 100).toString(),
              salePrice: (steamPrice.final / 100).toString(),
              savings: steamPrice.discount_percent.toString(),
              thumb: game.thumb,
              storeID: '1',
              dealRating: '0',
              gameID: game.id,
              steamAppID: game.id,
              isDLC: game.isDLC,
              isBundle: game.isBundle,
              type: game.type,
              steamPriceVN: steamPrice
            };
          } catch (error) {
            console.log('Error enriching game:', game.title);
            // Return basic data as fallback
            return {
              dealID: game.dealID || `steam_${game.id}`,
              title: game.title,
              normalPrice: game.normalPrice,
              salePrice: game.price,
              savings: game.savings,
              thumb: game.thumb,
              storeID: '1',
              dealRating: '0',
              gameID: game.id,
              steamAppID: game.id,
              isDLC: game.isDLC,
              isBundle: game.isBundle,
              type: game.type,
              steamPriceVN: undefined
            };
          }
        })
      );
      
      // CHỈ GIỮ LẠI GAMES ĐANG SALE (discount >= 5%)
      const gamesOnSale = enrichedGames.filter(game => {
        // Nếu có Steam VN price, check discount_percent
        if (game.steamPriceVN) {
          return game.steamPriceVN.discount_percent >= 5;
        }
        // Nếu không có Steam VN price, check savings từ CheapShark
        return parseFloat(game.savings) >= 5;
      });
      
      console.log(`📊 Filtered: ${enrichedGames.length} games → ${gamesOnSale.length} games đang sale >= 5% (removed ${enrichedGames.length - gamesOnSale.length} non-sale/low-discount items)`);
      
      return gamesOnSale;
    } catch (error) {
      console.error('Error fetching Steam sale games:', error);
      return [];
    }
  };

  const fetchGameDeals = async (isRefresh: boolean = false) => {
    if (isRefresh) {
      setPage(0);
      setHasMore(true);
      setAllSteamGames([]); // Reset cache
    }
    
    try {
      const newGames = await fetchSteamSaleGames(0, isRefresh);
      setDeals(newGames);
      setFilteredDeals(newGames);
      setPage(1);
    } catch (error) {
      console.error('Error fetching deals:', error);
      Alert.alert('Lỗi', 'Không thể tải dữ liệu game sale');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSteamPrice = async (steamAppID: string, retries = 2) => {
    try {
      // Sử dụng Steam Store API để lấy giá chính xác cho region VN
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamAppID}&cc=vn&l=vietnamese`);
      
      // Check if response is ok
      if (!response.ok) {
        console.log(`Steam API error for ${steamAppID}: ${response.status}`);
        return null;
      }
      
      const text = await response.text();
      
      // Check if response is JSON
      if (!text.trim().startsWith('{')) {
        console.log(`Steam API returned non-JSON for ${steamAppID}`);
        return null;
      }
      
      const data = JSON.parse(text);
      return data[steamAppID]?.data?.price_overview || null;
    } catch (error) {
      if (retries > 0) {
        console.log(`Retrying Steam price fetch for ${steamAppID}, retries left: ${retries}`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
        return fetchSteamPrice(steamAppID, retries - 1);
      }
      console.error(`Error fetching Steam price for ${steamAppID}:`, error);
      return null;
    }
  };

  const fetchGameDetail = useCallback(async (steamAppID: string, retries = 2) => {
    setLoadingDetail(true);
    try {
      // Lấy thông tin chi tiết từ Steam API
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamAppID}&cc=vn&l=vietnamese`);
      
      // Check if response is ok
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const text = await response.text();
      
      // Check if response is JSON
      if (!text.trim().startsWith('{')) {
        throw new Error('Response is not JSON');
      }
      
      const data = JSON.parse(text);
      const gameDetail = data[steamAppID]?.data;
      
      if (!gameDetail) {
        Alert.alert('Lỗi', 'Không thể tải thông tin chi tiết game');
        setLoadingDetail(false);
        return;
      }
      
      // Tạo object tương thích với interface GameDetail
      const formattedData = {
        info: {
          title: gameDetail.name,
          steamAppID: steamAppID,
          thumb: gameDetail.header_image
        },
        deals: [], // Không cần deals array nữa vì chỉ dùng Steam VN
        cheapestPriceEver: {
          price: gameDetail.price_overview ? (gameDetail.price_overview.final / 100).toString() : "0",
          date: Date.now() / 1000 // Current timestamp
        },
        steamPriceVN: gameDetail.price_overview,
        description: gameDetail.short_description,
        screenshots: gameDetail.screenshots?.slice(0, 3) || [],
        genres: gameDetail.genres || [],
        developers: gameDetail.developers || [],
        publishers: gameDetail.publishers || []
      };
      
      console.log('Steam Game Detail:', formattedData); // Debug log
      setSelectedGame(formattedData);
      setShowGameDetail(true);
    } catch (error) {
      if (retries > 0) {
        console.log(`Retrying game detail fetch for ${steamAppID}, retries left: ${retries}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        return fetchGameDetail(steamAppID, retries - 1);
      }
      console.error('Error fetching Steam game detail:', error);
      Alert.alert('Lỗi', 'Steam API tạm thời không khả dụng. Vui lòng thử lại sau.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleGamePress = useCallback(async (deal: GameDeal) => {
    if (!deal.steamAppID) {
      Alert.alert('Thông báo', 'Game này chưa có thông tin chi tiết');
      return;
    }

    setShowGameDetail(true);
    setLoadingDetail(true);
    setSelectedGame(null);

    // Fetch game detail from Steam
    await fetchGameDetail(deal.steamAppID);
  }, [fetchGameDetail]);

  useEffect(() => {
    fetchExchangeRate();
    fetchGameDeals();
  }, []);

  // Handle tab double-tap to refresh
  useFocusEffect(
    useCallback(() => {
      const currentTime = Date.now();
      const timeSinceLastFocus = currentTime - lastFocusTime.current;
      
      console.log(`📊 Focus Event - Current: ${currentTime}, Last: ${lastFocusTime.current}, Diff: ${timeSinceLastFocus}ms, Was Focused: ${isFocused.current}`);
      
      // Check for double tap: was already focused AND quick succession (< 2 seconds)
      if (isFocused.current && timeSinceLastFocus > 100 && timeSinceLastFocus < 2000) {
        console.log('🔄 DOUBLE TAB DETECTED! Refreshing...');
        
        // Show notification
        setShowRefreshNotification(true);
        setTimeout(() => setShowRefreshNotification(false), 2000);
        
        // Inline refresh to avoid dependency issues
        setRefreshing(true);
        setPage(0);
        setHasMore(true);
        setAllSteamGames([]);
        
        // Trigger refresh
        fetchExchangeRate();
        fetchGameDeals(true);
      }
      
      isFocused.current = true;
      lastFocusTime.current = currentTime;
      
      return () => {
        console.log('📱 Tab unfocused');
        isFocused.current = false;
      };
    }, [])
  );

  const loadMoreGames = async () => {
    console.log(`Load more called: loading=${loadingMore}, hasMore=${hasMore}, page=${page}`);
    
    if (loadingMore || !hasMore) {
      console.log('Load more blocked:', { loadingMore, hasMore });
      return;
    }
    
    setLoadingMore(true);
    try {
      console.log(`Fetching page ${page}...`);
      const newGames = await fetchSteamSaleGames(page, false);
      console.log(`Got ${newGames.length} new games`);
      
      if (newGames.length > 0) {
        const updatedDeals = [...deals, ...newGames];
        setDeals(updatedDeals);
        
        // Apply current filter to new deals
        if (selectedFilter === 'all') {
          setFilteredDeals(updatedDeals);
        } else {
          applyFilterToDeals(updatedDeals, selectedFilter);
        }
        
        setPage(page + 1);
        console.log(`Updated to page ${page + 1}, total deals: ${updatedDeals.length}`);
      } else {
        setHasMore(false);
        console.log('No more games available');
      }
    } catch (error) {
      console.error('Error loading more games:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = () => {
    console.log('🔄 Manual refresh triggered');
    setRefreshing(true);
    fetchExchangeRate();
    fetchGameDeals(true);
  };

  const handleDoubleTapRefresh = async () => {
    console.log('🔄 Double tap refresh started');
    setRefreshing(true);
    
    try {
      // Reset pagination
      setPage(0);
      setHasMore(true);
      setAllSteamGames([]);
      
      // Fetch fresh data
      await fetchExchangeRate();
      await fetchGameDeals(true);
      
      console.log('✅ Double tap refresh completed');
    } catch (error) {
      console.error('❌ Double tap refresh failed:', error);
    }
  };

  const formatVND = (usdPrice: string) => {
    const priceInVND = parseFloat(usdPrice) * exchangeRate;
    const formattedPrice = new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(priceInVND);
    return `${formattedPrice} VND`;
  };

  const getStoreName = (storeID: string) => {
    return storeNames[storeID] || `Store ${storeID}`;
  };

  const applyFilterToDeals = useCallback((dealsToFilter: GameDeal[], filter: PriceFilter | string) => {
    if (filter === 'all') {
      setFilteredDeals(dealsToFilter);
      return;
    }

    const filtered = dealsToFilter.filter(deal => {
      // Price filters
      const priceInVND = deal.steamPriceVN ? deal.steamPriceVN.final : 0; // Steam price already in VND cents
      
      switch (filter) {
        case 'under100k':
          return priceInVND < 10000000; // 100k VND = 10,000,000 cents
        case '100k-500k':
          return priceInVND >= 10000000 && priceInVND < 50000000;
        case '500k-1m':
          return priceInVND >= 50000000 && priceInVND < 100000000;
        case 'over1m':
          return priceInVND >= 100000000;
        default:
          return true;
      }
    });
    
    setFilteredDeals(filtered);
  }, []);

  const filterDealsByPrice = useCallback((filter: PriceFilter) => {
    setSelectedFilter(filter);
    applyFilterToDeals(deals, filter);
  }, [deals, applyFilterToDeals]);

  const filterOptions = [
    { key: 'all', label: 'Tất cả', icon: '🎮' },
    { key: 'under100k', label: '< 100k', icon: '💰' },
    { key: '100k-500k', label: '100k-500k', icon: '💸' },
    { key: '500k-1m', label: '500k-1M', icon: '💎' },
    { key: 'over1m', label: '> 1M', icon: '👑' },
  ];

  const GameDealItem = memo(({ item, onPress }: { item: GameDeal; onPress: (item: GameDeal) => void }) => (
    <TouchableOpacity 
      style={{
        backgroundColor: '#3C3C3E',
        marginHorizontal: 16,
        marginVertical: 8,
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
      }}
      onPress={() => onPress(item)}
    >
      <Image 
        source={{ uri: item.thumb }} 
        style={{ 
          width: 60, 
          height: 60, 
          borderRadius: 8,
          backgroundColor: '#2C2C2E' 
        }}
        resizeMode="cover"
        loadingIndicatorSource={{ uri: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPC9zdmc+' }}
      />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text 
          style={{ 
            color: '#FFFFFF', 
            fontSize: 14, 
            fontWeight: '600',
            marginBottom: 4
          }}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center',
          marginBottom: 4
        }}>
          <Image 
            source={{ uri: 'https://store.steampowered.com/favicon.ico' }}
            style={{
              width: 12,
              height: 12,
              marginRight: 4,
            }}
          />
          <Text style={{ 
            color: '#66C0F4', 
            fontSize: 11, 
            fontWeight: '500',
            marginRight: 8
          }}>
            Steam VN
          </Text>
          {/* Badge phân loại Game vs DLC vs Bundle */}
          <View style={{
            backgroundColor: item.isBundle ? '#9C27B0' : (item.isDLC ? '#FF6B35' : '#4CAF50'),
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 8,
          }}>
            <Text style={{
              color: '#FFFFFF',
              fontSize: 8,
              fontWeight: 'bold'
            }}>
              {item.isBundle ? 'BUNDLE' : (item.isDLC ? 'DLC' : 'GAME')}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {item.steamPriceVN ? (
            <>
              {item.steamPriceVN.discount_percent > 0 && (
                <Text 
                  style={{ 
                    color: '#8E8E93', 
                    fontSize: 12,
                    textDecorationLine: 'line-through',
                    marginRight: 8
                  }}
                >
                  {item.steamPriceVN.initial_formatted}
                </Text>
              )}
              <Text 
                style={{ 
                  color: '#66C0F4', 
                  fontSize: 14,
                  fontWeight: 'bold',
                  marginRight: 8
                }}
              >
                {item.steamPriceVN.final_formatted}
              </Text>
              {item.steamPriceVN.discount_percent > 0 && (
                <View style={{
                  backgroundColor: '#4C6B22',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}>
                  <Text style={{ color: '#BEEE11', fontSize: 10, fontWeight: 'bold' }}>
                    -{item.steamPriceVN.discount_percent}%
                  </Text>
                </View>
              )}
            </>
          ) : (
            // Fallback: Hiển thị giá từ CheapShark với conversion
            <>
              <Text 
                style={{ 
                  color: '#8E8E93', 
                  fontSize: 12,
                  textDecorationLine: 'line-through',
                  marginRight: 8
                }}
              >
                {formatVND(item.normalPrice)}
              </Text>
              <Text 
                style={{ 
                  color: '#30D158', 
                  fontSize: 14,
                  fontWeight: 'bold',
                  marginRight: 8
                }}
              >
                {formatVND(item.salePrice)}
              </Text>
              {parseFloat(item.savings) > 0 && (
                <View style={{
                  backgroundColor: '#FF3B30',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' }}>
                    -{Math.round(parseFloat(item.savings))}%
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  ));

  const keyExtractor = useCallback((item: GameDeal) => item.dealID, []);
  
  const renderGameDeal = useCallback(({ item }: { item: GameDeal }) => (
    <GameDealItem item={item} onPress={handleGamePress} />
  ), [handleGamePress]);

  if (loading) {
    return (
      <View style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#2C2C2E",
      }}>
        <ActivityIndicator size="large" color="#A259FF" />
        <Text style={{ 
          color: '#FFFFFF', 
          marginTop: 16, 
          fontSize: 16 
        }}>
          Đang tải game sale...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#2C2C2E" }}>
      <View style={{
        paddingTop: 0,
        paddingHorizontal: 16,
        paddingBottom: 24,
        backgroundColor: "#1C1C1E",
      }}>
        <Text style={{ 
          fontSize: 28, 
          fontWeight: 'bold', 
          color: '#FFFFFF',
          marginBottom: 4
        }}>
          Steam Sale VN 🇻🇳
        </Text>
        <Text style={{ 
          fontSize: 16, 
          color: '#8E8E93',
          marginBottom: 16
        }}>
        </Text>
        
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 16 }}
        >
          {filterOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              onPress={() => filterDealsByPrice(option.key as any)}
              style={{
                backgroundColor: selectedFilter === option.key ? '#A259FF' : '#3C3C3E',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                marginRight: 10,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text style={{ marginRight: 4, fontSize: 12 }}>
                {option.icon}
              </Text>
              <Text style={{
                color: selectedFilter === option.key ? '#FFFFFF' : '#8E8E93',
                fontSize: 13,
                fontWeight: selectedFilter === option.key ? 'bold' : 'normal',
              }}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredDeals}
        renderItem={renderGameDeal}
        keyExtractor={keyExtractor}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#A259FF"
          />
        }
        onEndReached={loadMoreGames}
        onEndReachedThreshold={0.5}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={8}
        getItemLayout={(data, index) => (
          {length: 120, offset: 120 * index, index}
        )}
        updateCellsBatchingPeriod={100}
        ListFooterComponent={() => 
          loadingMore ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#A259FF" />
              <Text style={{ color: '#8E8E93', marginTop: 8, fontSize: 12 }}>
                Đang tải thêm game...
              </Text>
            </View>
          ) : !hasMore ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#8E8E93', fontSize: 12 }}>
                🎮 Đã hiển thị tất cả games sale tại Steam VN
              </Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Game Detail Modal */}
      <Modal
        visible={showGameDetail}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowGameDetail(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#2C2C2E' }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: 50,
            paddingHorizontal: 16,
            paddingBottom: 16,
            backgroundColor: '#1C1C1E',
          }}>
            <TouchableOpacity
              onPress={() => setShowGameDetail(false)}
              style={{
                padding: 8,
                marginRight: 12,
              }}
            >
              <Text style={{ color: '#A259FF', fontSize: 16, fontWeight: 'bold' }}>
                ← Đóng
              </Text>
            </TouchableOpacity>
            <Text style={{
              flex: 1,
              color: '#FFFFFF',
              fontSize: 18,
              fontWeight: 'bold',
            }} numberOfLines={1}>
              {selectedGame?.info.title || 'Chi tiết Game'}
            </Text>
          </View>

          {loadingDetail ? (
            <View style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <ActivityIndicator size="large" color="#A259FF" />
              <Text style={{ color: '#FFFFFF', marginTop: 16, fontSize: 16 }}>
                Đang tải thông tin...
              </Text>
            </View>
          ) : selectedGame ? (
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {/* Game Header Image */}
              <View style={{ padding: 16 }}>
                <Image
                  source={{ uri: selectedGame.info.thumb }}
                  style={{
                    width: '100%',
                    height: 200,
                    borderRadius: 12,
                    backgroundColor: '#3C3C3E',
                  }}
                  resizeMode="cover"
                />
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 18,
                  fontWeight: 'bold',
                  marginTop: 12,
                  textAlign: 'center'
                }}>
                  {selectedGame.info.title}
                </Text>
              </View>

              {/* Game Description */}
              {selectedGame.description && (
                <View style={{
                  backgroundColor: '#3C3C3E',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  marginHorizontal: 16,
                }}>
                  <Text style={{ color: '#A259FF', fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
                     Mô tả
                  </Text>
                  <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20 }}>
                    {selectedGame.description}
                  </Text>
                </View>
              )}

              {/* Screenshots */}
              {selectedGame.screenshots && selectedGame.screenshots.length > 0 && (
                <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>
                     Screenshots
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {selectedGame.screenshots.map((screenshot, index) => (
                      <Image
                        key={index}
                        source={{ uri: screenshot.path_thumbnail }}
                        style={{
                          width: 200,
                          height: 112,
                          borderRadius: 8,
                          marginRight: 12,
                          backgroundColor: '#3C3C3E'
                        }}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Game Info */}
              <View style={{
                backgroundColor: '#3C3C3E',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                marginHorizontal: 16,
              }}>
                <Text style={{ color: '#A259FF', fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>
                   Thông tin game
                </Text>
                
                {selectedGame.genres && selectedGame.genres.length > 0 && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: '#8E8E93', fontSize: 12, marginBottom: 4 }}>Thể loại:</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 14 }}>
                      {selectedGame.genres.map(g => g.description).join(', ')}
                    </Text>
                  </View>
                )}
                
                {selectedGame.developers && selectedGame.developers.length > 0 && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: '#8E8E93', fontSize: 12, marginBottom: 4 }}>Nhà phát triển:</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 14 }}>
                      {selectedGame.developers.join(', ')}
                    </Text>
                  </View>
                )}
                
                {selectedGame.publishers && selectedGame.publishers.length > 0 && (
                  <View>
                    <Text style={{ color: '#8E8E93', fontSize: 12, marginBottom: 4 }}>Nhà xuất bản:</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 14 }}>
                      {selectedGame.publishers.join(', ')}
                    </Text>
                  </View>
                )}
              </View>

              {/* Steam VN Price (Official) */}
              {selectedGame.steamPriceVN && (
                <View style={{ paddingHorizontal: 16 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>
                    🎮 Giá chính thức Steam VN
                  </Text>
                  <View style={{
                    backgroundColor: '#1B2838',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderWidth: 2,
                    borderColor: '#66C0F4'
                  }}>
                    <View>
                      <View style={{ 
                        flexDirection: 'row', 
                        alignItems: 'center',
                        marginBottom: 4
                      }}>
                        <Image 
                          source={{ uri: 'https://store.steampowered.com/favicon.ico' }}
                          style={{
                            width: 16,
                            height: 16,
                            marginRight: 6,
                          }}
                        />
                        <Text style={{ 
                          color: '#66C0F4', 
                          fontSize: 13, 
                          fontWeight: '600'
                        }}>
                          Steam Store VN (Chính thức)
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {selectedGame.steamPriceVN.discount_percent > 0 && (
                          <Text style={{
                            color: '#8E8E93',
                            fontSize: 12,
                            textDecorationLine: 'line-through',
                            marginRight: 8
                          }}>
                            {selectedGame.steamPriceVN.initial_formatted}
                          </Text>
                        )}
                        <Text style={{ color: '#ACDBF5', fontSize: 16, fontWeight: 'bold' }}>
                          {selectedGame.steamPriceVN.final_formatted}
                        </Text>
                      </View>
                    </View>
                    {selectedGame.steamPriceVN.discount_percent > 0 && (
                      <View style={{
                        backgroundColor: '#4C6B22',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 4,
                      }}>
                        <Text style={{ color: '#BEEE11', fontSize: 10, fontWeight: 'bold' }}>
                          -{selectedGame.steamPriceVN.discount_percent}%
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Fallback if no Steam VN price */}
              {!selectedGame.steamPriceVN && (
                <View style={{ paddingHorizontal: 16 }}>
                  <Text style={{ color: '#8E8E93', fontSize: 14, textAlign: 'center', marginTop: 20 }}>
                    Game này chưa có trên Steam Việt Nam
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      {/* Refresh Notification */}
      {showRefreshNotification && (
        <View style={{
          position: 'absolute',
          top: 100,
          left: 20,
          right: 20,
          backgroundColor: 'rgba(162, 89, 255, 0.95)',
          borderRadius: 12,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 10,
        }}>
          <ActivityIndicator 
            size="small" 
            color="#FFFFFF" 
            style={{ marginRight: 12 }}
          />
          <Text style={{
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: 'bold',
          }}>
            🔄 Đang refresh danh sách...
          </Text>
        </View>
      )}
    </View>
  );
}