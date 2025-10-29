import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

interface SearchResult {
  dealID: string;
  title: string;
  normalPrice: string;
  salePrice: string;
  savings: string;
  thumb: string;
  storeID: string;
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
  name: string;
  steam_appid: number;
  short_description: string;
  header_image: string;
  screenshots?: Array<{
    id: number;
    path_thumbnail: string;
    path_full: string;
  }>;
  genres?: Array<{
    id: string;
    description: string;
  }>;
  release_date?: {
    coming_soon: boolean;
    date: string;
  };
  developers?: string[];
  publishers?: string[];
  price_overview?: {
    currency: string;
    initial: number;
    final: number;
    discount_percent: number;
    initial_formatted: string;
    final_formatted: string;
  };
}

interface DLCResult {
  dealID: string;
  title: string;
  normalPrice: string;
  salePrice: string;
  savings: string;
  thumb: string;
  steamAppID?: string;
  steamPriceVN?: {
    currency: string;
    initial: number;
    final: number;
    discount_percent: number;
    initial_formatted: string;
    final_formatted: string;
  } | null;
}



// Cache for search results to persist across tab switches
const searchCache = {
  query: '',
  results: [] as SearchResult[],
  timestamp: 0
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export default function SearchTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(['Cyberpunk', 'Elden Ring', 'Call of Duty', 'FIFA']);
  const searchInputRef = useRef<TextInput>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(25000);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Sale data states
  const [saleGames, setSaleGames] = useState<SearchResult[]>([]);
  const [saleDLCs, setSaleDLCs] = useState<SearchResult[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  
  // Modal states
  const [selectedGame, setSelectedGame] = useState<SearchResult | null>(null);
  const [gameDetail, setGameDetail] = useState<GameDetail | null>(null);
  const [gameDLCs, setGameDLCs] = useState<DLCResult[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchSteamPrice = async (steamAppID: string) => {
    try {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamAppID}&cc=vn&l=vietnamese`);
      const data = await response.json();
      return data[steamAppID]?.data?.price_overview || null;
    } catch (error) {
      return null;
    }
  };

  const classifyContent = (title: string) => {
    const titleLower = title.toLowerCase();
    
    let contentType = 'Game';
    let isDLC = false;
    let isBundle = false;
    
    if (titleLower.includes('bundle') || 
        titleLower.includes('complete edition') ||
        titleLower.includes('definitive edition') ||
        titleLower.includes('goty') || 
        titleLower.includes('game of the year') ||
        titleLower.includes('ultimate edition') ||
        titleLower.includes('deluxe edition') ||
        titleLower.includes('gold edition')) {
      contentType = 'Bundle';
      isBundle = true;
    } else if (titleLower.includes('dlc') || 
               titleLower.includes('expansion') || 
               titleLower.includes('season pass') ||
               titleLower.includes('add-on') ||
               titleLower.includes('pack') ||
               titleLower.includes(' - ')) {
      contentType = 'DLC';
      isDLC = true;
    }
    
    return { contentType, isDLC, isBundle };
  };

  const formatVND = (usdPrice: string) => {
    const priceInVND = parseFloat(usdPrice) * exchangeRate;
    const formattedPrice = new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(priceInVND);
    return `${formattedPrice} VND`;
  };

  // Fetch game detail from Steam
  const fetchGameDetail = async (steamAppID: string): Promise<GameDetail | null> => {
    try {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamAppID}&cc=vn&l=vietnamese`);
      
      if (!response.ok) {
        console.error(`Steam API error: ${response.status}`);
        return null;
      }
      
      const text = await response.text();
      
      // Check if response is JSON
      if (!text.trim().startsWith('{')) {
        console.error('Steam API returned non-JSON response');
        return null;
      }
      
      const data = JSON.parse(text);
      return data[steamAppID]?.data || null;
    } catch (error) {
      console.error('Error fetching game detail:', error);
      return null;
    }
  };

  // Fetch DLCs using Steam API (more accurate method)
  const fetchGameDLCs = async (steamAppID: string): Promise<DLCResult[]> => {
    try {
      console.log('🔍 Fetching DLCs for Steam AppID:', steamAppID);
      
      // Step 1: Get game details to get DLC list from Steam
      const gameResponse = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${steamAppID}&cc=vn&l=vietnamese`
      );
      
      if (!gameResponse.ok) {
        console.log(`Steam API error: ${gameResponse.status}`);
        return [];
      }
      
      const gameText = await gameResponse.text();
      
      // Check if response is JSON
      if (!gameText.trim().startsWith('{')) {
        console.log('Steam API returned non-JSON response');
        return [];
      }
      
      const gameData = JSON.parse(gameText);
      const gameInfo = gameData[steamAppID]?.data;
      
      if (!gameInfo || !gameInfo.dlc || gameInfo.dlc.length === 0) {
        console.log('📦 No DLC found in Steam data');
        return [];
      }
      
      console.log(`📦 Found ${gameInfo.dlc.length} DLC AppIDs in Steam data`);
      
      // Step 2: Get details for each DLC from Steam API
      const dlcDetails = await Promise.all(
        gameInfo.dlc.slice(0, 15).map(async (dlcAppId: number) => {
          try {
            const dlcResponse = await fetch(
              `https://store.steampowered.com/api/appdetails?appids=${dlcAppId}&cc=vn&l=vietnamese`
            );
            
            if (!dlcResponse.ok) {
              return null;
            }
            
            const dlcText = await dlcResponse.text();
            
            if (!dlcText.trim().startsWith('{')) {
              return null;
            }
            
            const dlcData = JSON.parse(dlcText);
            return dlcData[dlcAppId]?.data;
          } catch (error) {
            console.error(`Error fetching DLC ${dlcAppId}:`, error);
            return null;
          }
        })
      );
      
      // Step 3: Filter valid DLCs and format data
      const validDLCs = dlcDetails
        .filter(dlc => dlc && dlc.name && dlc.header_image)
        .map((dlc, index) => ({
          dealID: `steam_dlc_${dlc.steam_appid}`, // Create unique ID for Steam DLC
          title: dlc.name,
          normalPrice: dlc.price_overview ? (dlc.price_overview.initial / 100).toString() : '0',
          salePrice: dlc.price_overview ? (dlc.price_overview.final / 100).toString() : '0',
          savings: dlc.price_overview ? dlc.price_overview.discount_percent.toString() : '0',
          thumb: dlc.header_image,
          steamAppID: dlc.steam_appid?.toString(),
          steamPriceVN: dlc.price_overview ? {
            currency: dlc.price_overview.currency,
            initial: dlc.price_overview.initial,
            final: dlc.price_overview.final,
            discount_percent: dlc.price_overview.discount_percent,
            initial_formatted: dlc.price_overview.initial_formatted || `${dlc.price_overview.initial / 100} ${dlc.price_overview.currency}`,
            final_formatted: dlc.price_overview.final_formatted || `${dlc.price_overview.final / 100} ${dlc.price_overview.currency}`
          } : null
        }));
      
      console.log(`🎮 Successfully processed ${validDLCs.length} DLCs`);
      return validDLCs;
      
    } catch (error) {
      console.error('Error fetching DLCs:', error);
      return [];
    }
  };

  // Handle game selection
  const handleGamePress = async (game: SearchResult) => {
    setSelectedGame(game);
    setModalVisible(true);
    setLoadingDetail(true);
    setGameDetail(null);
    setGameDLCs([]);

    if (game.steamAppID) {
      // Fetch game detail and DLCs in parallel using Steam AppID
      const [detail, dlcs] = await Promise.all([
        fetchGameDetail(game.steamAppID),
        fetchGameDLCs(game.steamAppID)
      ]);
      
      setGameDetail(detail);
      setGameDLCs(dlcs);
    }
    
    setLoadingDetail(false);
  };

  // Fetch games and DLCs on sale
  const fetchSaleGamesAndDLCs = async () => {
    setLoadingSales(true);
    try {
      // Fetch current Steam sales from CheapShark
      const response = await fetch('https://www.cheapshark.com/api/1.0/deals?storeID=1&pageSize=100&onSale=1&sortBy=Savings');
      const data = await response.json();
      
      console.log(`🔥 Found ${data.length} items on sale`);
      
      // Process and classify results
      const processedResults = await Promise.all(
        data.map(async (deal: any) => {
          const { contentType, isDLC, isBundle } = classifyContent(deal.title);
          
          // Try to get Steam VN price
          let steamPriceVN = null;
          if (deal.steamAppID && parseFloat(deal.savings) > 10) { // Only for significant sales
            steamPriceVN = await fetchSteamPrice(deal.steamAppID);
          }
          
          return {
            dealID: deal.dealID,
            title: deal.title,
            normalPrice: deal.normalPrice,
            salePrice: deal.salePrice,
            savings: deal.savings,
            thumb: deal.thumb,
            storeID: deal.storeID,
            steamAppID: deal.steamAppID,
            isDLC,
            isBundle,
            type: contentType as 'Game' | 'DLC' | 'Bundle',
            steamPriceVN
          };
        })
      );
      
      // Filter games and DLCs with significant discounts
      const significantSales = processedResults.filter(item => parseFloat(item.savings) >= 15);
      
      // Separate games and DLCs
      const games = significantSales.filter(item => item.type === 'Game').slice(0, 20);
      const dlcs = significantSales.filter(item => item.type === 'DLC').slice(0, 15);
      
      setSaleGames(games);
      setSaleDLCs(dlcs);
      
      console.log(`🎮 Found ${games.length} games on sale, ${dlcs.length} DLCs on sale`);
      
    } catch (error) {
      console.error('Error fetching sale data:', error);
    } finally {
      setLoadingSales(false);
    }
  };

  const searchGames = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setLoading(true);
    try {
      // Search CheapShark API
      const response = await fetch(`https://www.cheapshark.com/api/1.0/deals?title=${encodeURIComponent(query)}&storeID=1&pageSize=50`);
      const data = await response.json();
      
      // Process and classify results
      const processedResults = await Promise.all(
        data.map(async (deal: any) => {
          const { contentType, isDLC, isBundle } = classifyContent(deal.title);
          
          // Try to get Steam VN price
          let steamPriceVN = null;
          if (deal.steamAppID) {
            steamPriceVN = await fetchSteamPrice(deal.steamAppID);
          }
          
          return {
            dealID: deal.dealID,
            title: deal.title,
            normalPrice: deal.normalPrice,
            salePrice: deal.salePrice,
            savings: deal.savings,
            thumb: deal.thumb,
            storeID: deal.storeID,
            steamAppID: deal.steamAppID,
            isDLC,
            isBundle,
            type: contentType as 'Game' | 'DLC' | 'Bundle',
            steamPriceVN
          };
        })
      );
      
      setSearchResults(processedResults);
      
      // Add to recent searches
      if (!recentSearches.includes(query)) {
        setRecentSearches([query, ...recentSearches.slice(0, 4)]);
      }
      
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Lỗi', 'Không thể tìm kiếm game');
    } finally {
      setLoading(false);
    }
  };

  // Debounced search function
  const debouncedSearch = useCallback((query: string) => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Set new debounce
    debounceRef.current = setTimeout(() => {
      if (query.trim().length >= 2) {
        searchGames(query.trim());
      } else if (query.trim().length === 0) {
        setSearchResults([]);
      }
    }, 800); // 800ms delay
  }, []);

  // Effect to trigger search when query changes
  useEffect(() => {
    debouncedSearch(searchQuery);
    
    // Cleanup on unmount
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, debouncedSearch]);

  // Effect to load sale data on component mount
  useEffect(() => {
    fetchSaleGamesAndDLCs();
  }, []);



  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchGames(searchQuery.trim());
    }
  };

  const handleRecentSearch = (query: string) => {
    setSearchQuery(query);
    searchGames(query);
  };

  const SearchResultItem = memo(({ item, onPress }: { item: SearchResult; onPress: (item: SearchResult) => void }) => (
    <TouchableOpacity 
      onPress={() => onPress(item)}
      style={{
        backgroundColor: '#3C3C3E',
        marginHorizontal: 16,
        marginVertical: 6,
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Image 
        source={{ uri: item.thumb }} 
        style={{ 
          width: 60, 
          height: 60, 
          borderRadius: 8,
          backgroundColor: '#2C2C2E' 
        }}
      />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center',
          marginBottom: 4
        }}>
          <Text 
            style={{ 
              color: '#FFFFFF', 
              fontSize: 14, 
              fontWeight: '600',
              flex: 1
            }}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <View style={{
            backgroundColor: item.isBundle ? '#9C27B0' : (item.isDLC ? '#FF6B35' : '#4CAF50'),
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            marginLeft: 8,
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
            <>
              {parseFloat(item.savings) > 0 && (
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
              )}
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

  const keyExtractorSearch = useCallback((item: SearchResult) => item.dealID, []);

  const renderSearchResult = useCallback(({ item }: { item: SearchResult }) => (
    <SearchResultItem item={item} onPress={handleGamePress} />
  ), [handleGamePress]);

  const SaleItem = memo(({ item, isCompact = false, onPress }: { item: SearchResult, isCompact?: boolean, onPress: (item: SearchResult) => void }) => (
    <TouchableOpacity 
      onPress={() => onPress(item)}
      style={{
        backgroundColor: '#3C3C3E',
        marginRight: isCompact ? 12 : 16,
        marginVertical: isCompact ? 0 : 6,
        borderRadius: 12,
        padding: isCompact ? 8 : 12,
        flexDirection: isCompact ? 'column' : 'row',
        alignItems: isCompact ? 'flex-start' : 'center',
        width: isCompact ? 160 : undefined,
        ...(isCompact ? {} : { marginHorizontal: 16 })
      }}
    >
      <Image 
        source={{ uri: item.thumb }} 
        style={{ 
          width: isCompact ? 144 : 60, 
          height: isCompact ? 81 : 60, 
          borderRadius: 8,
          backgroundColor: '#2C2C2E',
          ...(isCompact ? { marginBottom: 8 } : {})
        }}
        resizeMode="cover"
      />
      <View style={{ flex: 1, ...(isCompact ? {} : { marginLeft: 12 }) }}>
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center',
          marginBottom: 4
        }}>
          <Text 
            style={{ 
              color: '#FFFFFF', 
              fontSize: isCompact ? 12 : 14, 
              fontWeight: '600',
              flex: 1
            }}
            numberOfLines={isCompact ? 2 : 2}
          >
            {item.title}
          </Text>
          {!isCompact && (
            <View style={{
              backgroundColor: item.isBundle ? '#9C27B0' : (item.isDLC ? '#FF6B35' : '#4CAF50'),
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              marginLeft: 8,
            }}>
              <Text style={{
                color: '#FFFFFF',
                fontSize: 8,
                fontWeight: 'bold'
              }}>
                {item.isBundle ? 'BUNDLE' : (item.isDLC ? 'DLC' : 'GAME')}
              </Text>
            </View>
          )}
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          {item.steamPriceVN ? (
            <>
              {item.steamPriceVN.discount_percent > 0 && (
                <Text 
                  style={{ 
                    color: '#8E8E93', 
                    fontSize: isCompact ? 10 : 12,
                    textDecorationLine: 'line-through',
                    marginRight: 6
                  }}
                >
                  {item.steamPriceVN.initial_formatted}
                </Text>
              )}
              <Text 
                style={{ 
                  color: '#66C0F4', 
                  fontSize: isCompact ? 12 : 14,
                  fontWeight: 'bold',
                  marginRight: 6
                }}
              >
                {item.steamPriceVN.final_formatted}
              </Text>
              {item.steamPriceVN.discount_percent > 0 && (
                <View style={{
                  backgroundColor: '#4C6B22',
                  paddingHorizontal: 4,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}>
                  <Text style={{ color: '#BEEE11', fontSize: 9, fontWeight: 'bold' }}>
                    -{item.steamPriceVN.discount_percent}%
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              {parseFloat(item.savings) > 0 && (
                <Text 
                  style={{ 
                    color: '#8E8E93', 
                    fontSize: isCompact ? 10 : 12,
                    textDecorationLine: 'line-through',
                    marginRight: 6
                  }}
                >
                  {formatVND(item.normalPrice)}
                </Text>
              )}
              <Text 
                style={{ 
                  color: '#30D158', 
                  fontSize: isCompact ? 12 : 14,
                  fontWeight: 'bold',
                  marginRight: 6
                }}
              >
                {formatVND(item.salePrice)}
              </Text>
              {parseFloat(item.savings) > 0 && (
                <View style={{
                  backgroundColor: '#FF3B30',
                  paddingHorizontal: 4,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: 'bold' }}>
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

  const renderSaleItem = useCallback(({ item, isCompact = false }: { item: SearchResult, isCompact?: boolean }) => (
    <SaleItem item={item} isCompact={isCompact} onPress={handleGamePress} />
  ), [handleGamePress]);

  return (
    <View style={{ flex: 1, backgroundColor: "#2C2C2E" }}>
      {/* Header & Search */}
      <View style={{
        paddingTop: 0,
        paddingHorizontal: 16,
        paddingBottom: 20,
        backgroundColor: "#1C1C1E",
      }}>
        <Text style={{ 
          fontSize: 28, 
          fontWeight: 'bold', 
          color: '#FFFFFF',
          marginBottom: 16
        }}>
          🔍 Tìm kiếm Game
        </Text>
        
        {/* Search Input */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: '#3C3C3E',
          borderRadius: 12,
          padding: 4,
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <View style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingRight: 8,
          }}>
            <TextInput
              ref={searchInputRef}
              style={{
                flex: 1,
                padding: 12,
                color: '#FFFFFF',
                fontSize: 16,
              }}
              placeholder="Nhập tên game cần tìm... "
              placeholderTextColor="#8E8E93"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {loading && (
              <ActivityIndicator 
                size="small" 
                color="#A259FF" 
                style={{ marginRight: 8 }}
              />
            )}
          </View>
          <TouchableOpacity
            onPress={handleSearch}
            style={{
              backgroundColor: '#A259FF',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 8,
              marginRight: 4,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Tìm</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <ActivityIndicator size="large" color="#A259FF" />
          <Text style={{ color: '#FFFFFF', marginTop: 16, fontSize: 16 }}>
            Đang tìm kiếm...
          </Text>
        </View>
      ) : searchResults.length > 0 ? (
        <FlatList
          data={searchResults}
          renderItem={renderSearchResult}
          keyExtractor={keyExtractorSearch}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          // Performance optimizations
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          windowSize={8}
          initialNumToRender={6}
          updateCellsBatchingPeriod={50}
        />
      ) : searchQuery ? (
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 32,
        }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>😕</Text>
          <Text style={{ 
            color: '#FFFFFF', 
            fontSize: 18,
            fontWeight: 'bold',
            marginBottom: 8,
            textAlign: 'center'
          }}>
            Không tìm thấy game
          </Text>
          <Text style={{ 
            color: '#8E8E93', 
            fontSize: 14,
            textAlign: 'center'
          }}>
            Thử tìm kiếm với từ khóa khác hoặc kiểm tra lại chính tả
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Recent Searches */}
          <View style={{ padding: 16, paddingBottom: 8 }}>
            <Text style={{ 
              color: '#FFFFFF', 
              fontSize: 16,
              fontWeight: 'bold',
              marginBottom: 12
            }}>
              � Tìm kiếm gần đây
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {recentSearches.map((search, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleRecentSearch(search)}
                  style={{
                    backgroundColor: '#3C3C3E',
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 16,
                    marginRight: 12,
                  }}
                >
                  <Text style={{ color: '#A259FF', fontSize: 14 }}>{search}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Sale Games Section */}
          {loadingSales ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#A259FF" />
              <Text style={{ color: '#FFFFFF', marginTop: 8 }}>Đang tải games sale...</Text>
            </View>
          ) : (
            <>
              {saleGames.length > 0 && (
                <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
                  <Text style={{ 
                    color: '#FFFFFF', 
                    fontSize: 18,
                    fontWeight: 'bold',
                    marginBottom: 12
                  }}>
                    🔥 Games đang Sale Hot ({saleGames.length})
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {saleGames.map((game) => (
                      <View key={game.dealID}>
                        {renderSaleItem({ item: game, isCompact: true })}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {saleDLCs.length > 0 && (
                <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
                  <Text style={{ 
                    color: '#FFFFFF', 
                    fontSize: 18,
                    fontWeight: 'bold',
                    marginBottom: 12
                  }}>
                    📦 DLC đang Sale ({saleDLCs.length})
                  </Text>
                  <FlatList
                    data={saleDLCs.slice(0, 10)}
                    renderItem={({ item }) => renderSaleItem({ item })}
                    keyExtractor={(item) => item.dealID}
                    scrollEnabled={false}
                  />
                </View>
              )}

              {saleGames.length === 0 && saleDLCs.length === 0 && !loadingSales && (
                <View style={{
                  flex: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 32,
                  marginTop: 40,
                }}>
                  <Text style={{ fontSize: 64, marginBottom: 16 }}>🎮</Text>
                  <Text style={{ 
                    color: '#FFFFFF', 
                    fontSize: 18,
                    fontWeight: 'bold',
                    marginBottom: 8,
                    textAlign: 'center'
                  }}>
                    Tìm kiếm game yêu thích
                  </Text>
                  <Text style={{ 
                    color: '#8E8E93', 
                    fontSize: 14,
                    textAlign: 'center'
                  }}>
                    Nhập tên game để tìm kiếm hoặc xem các deal hot bên dưới
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Game Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
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
              onPress={() => setModalVisible(false)}
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
              {selectedGame?.title || 'Chi tiết Game'}
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
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Game Header Image */}
              {gameDetail?.header_image && (
                <Image
                  source={{ uri: gameDetail.header_image }}
                  style={{
                    width: '100%',
                    height: 200,
                    backgroundColor: '#3C3C3E',
                  }}
                  resizeMode="cover"
                />
              )}

              {/* Game Info */}
              <View style={{ padding: 16 }}>
                {/* Title & Price */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  marginBottom: 16,
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: '#FFFFFF',
                      fontSize: 20,
                      fontWeight: 'bold',
                      marginBottom: 8,
                    }}>
                      {gameDetail?.name || selectedGame?.title}
                    </Text>
                    
                    {/* Price */}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {gameDetail?.price_overview ? (
                        <>
                          {gameDetail.price_overview.discount_percent > 0 && (
                            <Text style={{
                              color: '#8E8E93',
                              fontSize: 16,
                              textDecorationLine: 'line-through',
                              marginRight: 8,
                            }}>
                              {gameDetail.price_overview.initial_formatted}
                            </Text>
                          )}
                          <Text style={{
                            color: '#66C0F4',
                            fontSize: 18,
                            fontWeight: 'bold',
                            marginRight: 8,
                          }}>
                            {gameDetail.price_overview.final_formatted}
                          </Text>
                          {gameDetail.price_overview.discount_percent > 0 && (
                            <View style={{
                              backgroundColor: '#4C6B22',
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                            }}>
                              <Text style={{
                                color: '#BEEE11',
                                fontSize: 12,
                                fontWeight: 'bold',
                              }}>
                                -{gameDetail.price_overview.discount_percent}%
                              </Text>
                            </View>
                          )}
                        </>
                      ) : selectedGame && (
                        <>
                          {parseFloat(selectedGame.savings) > 0 && (
                            <Text style={{
                              color: '#8E8E93',
                              fontSize: 16,
                              textDecorationLine: 'line-through',
                              marginRight: 8,
                            }}>
                              {formatVND(selectedGame.normalPrice)}
                            </Text>
                          )}
                          <Text style={{
                            color: '#30D158',
                            fontSize: 18,
                            fontWeight: 'bold',
                          }}>
                            {formatVND(selectedGame.salePrice)}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>

                  {/* Game Type Badge */}
                  <View style={{
                    backgroundColor: selectedGame?.isBundle ? '#9C27B0' : 
                                   (selectedGame?.isDLC ? '#FF6B35' : '#4CAF50'),
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                  }}>
                    <Text style={{
                      color: '#FFFFFF',
                      fontSize: 10,
                      fontWeight: 'bold',
                    }}>
                      {selectedGame?.isBundle ? 'BUNDLE' : 
                       (selectedGame?.isDLC ? 'DLC' : 'GAME')}
                    </Text>
                  </View>
                </View>

                {/* Description */}
                {gameDetail?.short_description && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{
                      color: '#FFFFFF',
                      fontSize: 16,
                      fontWeight: 'bold',
                      marginBottom: 8,
                    }}>
                      📝 Mô tả
                    </Text>
                    <Text style={{
                      color: '#CCCCCC',
                      fontSize: 14,
                      lineHeight: 20,
                    }}>
                      {gameDetail.short_description.replace(/<[^>]*>/g, '')}
                    </Text>
                  </View>
                )}

                {/* Game Info */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{
                    color: '#FFFFFF',
                    fontSize: 16,
                    fontWeight: 'bold',
                    marginBottom: 12,
                  }}>
                    ℹ️ Thông tin Game
                  </Text>

                  {gameDetail?.developers && (
                    <View style={{
                      flexDirection: 'row',
                      marginBottom: 8,
                    }}>
                      <Text style={{ color: '#8E8E93', fontSize: 14, width: 100 }}>
                        Nhà phát triển:
                      </Text>
                      <Text style={{ color: '#FFFFFF', fontSize: 14, flex: 1 }}>
                        {gameDetail.developers.join(', ')}
                      </Text>
                    </View>
                  )}

                  {gameDetail?.publishers && (
                    <View style={{
                      flexDirection: 'row',
                      marginBottom: 8,
                    }}>
                      <Text style={{ color: '#8E8E93', fontSize: 14, width: 100 }}>
                        Nhà xuất bản:
                      </Text>
                      <Text style={{ color: '#FFFFFF', fontSize: 14, flex: 1 }}>
                        {gameDetail.publishers.join(', ')}
                      </Text>
                    </View>
                  )}

                  {gameDetail?.release_date && (
                    <View style={{
                      flexDirection: 'row',
                      marginBottom: 8,
                    }}>
                      <Text style={{ color: '#8E8E93', fontSize: 14, width: 100 }}>
                        Ngày phát hành:
                      </Text>
                      <Text style={{ color: '#FFFFFF', fontSize: 14, flex: 1 }}>
                        {gameDetail.release_date.date}
                      </Text>
                    </View>
                  )}

                  {gameDetail?.genres && gameDetail.genres.length > 0 && (
                    <View style={{
                      flexDirection: 'row',
                      marginBottom: 8,
                    }}>
                      <Text style={{ color: '#8E8E93', fontSize: 14, width: 100 }}>
                        Thể loại:
                      </Text>
                      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                        {gameDetail.genres.map((genre, index) => (
                          <View
                            key={genre.id}
                            style={{
                              backgroundColor: '#3C3C3E',
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 12,
                              marginRight: 6,
                              marginBottom: 4,
                            }}
                          >
                            <Text style={{ color: '#A259FF', fontSize: 12 }}>
                              {genre.description}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {/* Screenshots */}
                {gameDetail?.screenshots && gameDetail.screenshots.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{
                      color: '#FFFFFF',
                      fontSize: 16,
                      fontWeight: 'bold',
                      marginBottom: 12,
                    }}>
                      📸 Ảnh chụp màn hình
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {gameDetail.screenshots.slice(0, 5).map((screenshot) => (
                        <Image
                          key={screenshot.id}
                          source={{ uri: screenshot.path_thumbnail }}
                          style={{
                            width: 200,
                            height: 112,
                            borderRadius: 8,
                            marginRight: 12,
                            backgroundColor: '#3C3C3E',
                          }}
                        />
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* DLCs Section */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{
                    color: '#FFFFFF',
                    fontSize: 16,
                    fontWeight: 'bold',
                    marginBottom: 12,
                  }}>
                    📦 DLC & Add-ons
                  </Text>
                  
                  {loadingDetail ? (
                    <View style={{
                      backgroundColor: '#3C3C3E',
                      borderRadius: 12,
                      padding: 20,
                      alignItems: 'center',
                    }}>
                      <ActivityIndicator size="small" color="#A259FF" />
                      <Text style={{ color: '#8E8E93', fontSize: 14, marginTop: 8 }}>
                        Đang tìm DLC...
                      </Text>
                    </View>
                  ) : gameDLCs.length > 0 ? (
                    <>
                      <Text style={{
                        color: '#A259FF',
                        fontSize: 14,
                        marginBottom: 8,
                      }}>
                        Tìm thấy {gameDLCs.length} DLC liên quan:
                      </Text>
                      {gameDLCs.map((dlc) => (
                        <TouchableOpacity
                          key={dlc.dealID}
                          style={{
                            backgroundColor: '#3C3C3E',
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <Image
                            source={{ uri: dlc.thumb }}
                            style={{
                              width: 50,
                              height: 50,
                              borderRadius: 8,
                              backgroundColor: '#2C2C2E',
                            }}
                          />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={{
                              color: '#FFFFFF',
                              fontSize: 14,
                              fontWeight: '600',
                              marginBottom: 4,
                            }} numberOfLines={2}>
                              {dlc.title}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              {dlc.steamPriceVN ? (
                                <>
                                  {dlc.steamPriceVN.discount_percent > 0 && (
                                    <Text style={{
                                      color: '#8E8E93',
                                      fontSize: 12,
                                      textDecorationLine: 'line-through',
                                      marginRight: 8,
                                    }}>
                                      {dlc.steamPriceVN.initial_formatted}
                                    </Text>
                                  )}
                                  <Text style={{
                                    color: dlc.steamPriceVN.final === 0 ? '#30D158' : '#66C0F4',
                                    fontSize: 14,
                                    fontWeight: 'bold',
                                    marginRight: 8,
                                  }}>
                                    {dlc.steamPriceVN.final === 0 ? 'Miễn phí' : dlc.steamPriceVN.final_formatted}
                                  </Text>
                                  {dlc.steamPriceVN.discount_percent > 0 && (
                                    <View style={{
                                      backgroundColor: '#4C6B22',
                                      paddingHorizontal: 6,
                                      paddingVertical: 2,
                                      borderRadius: 4,
                                    }}>
                                      <Text style={{
                                        color: '#BEEE11',
                                        fontSize: 10,
                                        fontWeight: 'bold',
                                      }}>
                                        -{dlc.steamPriceVN.discount_percent}%
                                      </Text>
                                    </View>
                                  )}
                                </>
                              ) : (
                                <>
                                  {parseFloat(dlc.savings) > 0 && (
                                    <Text style={{
                                      color: '#8E8E93',
                                      fontSize: 12,
                                      textDecorationLine: 'line-through',
                                      marginRight: 8,
                                    }}>
                                      {formatVND(dlc.normalPrice)}
                                    </Text>
                                  )}
                                  <Text style={{
                                    color: '#30D158',
                                    fontSize: 14,
                                    fontWeight: 'bold',
                                    marginRight: 8,
                                  }}>
                                    {formatVND(dlc.salePrice)}
                                  </Text>
                                  {parseFloat(dlc.savings) > 0 && (
                                    <View style={{
                                      backgroundColor: '#FF3B30',
                                      paddingHorizontal: 6,
                                      paddingVertical: 2,
                                      borderRadius: 4,
                                    }}>
                                      <Text style={{
                                        color: '#FFFFFF',
                                        fontSize: 10,
                                        fontWeight: 'bold',
                                      }}>
                                        -{Math.round(parseFloat(dlc.savings))}%
                                      </Text>
                                    </View>
                                  )}
                                </>
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </>
                  ) : (
                    <View style={{
                      backgroundColor: '#3C3C3E',
                      borderRadius: 12,
                      padding: 16,
                      alignItems: 'center',
                    }}>
                      <Text style={{ fontSize: 32, marginBottom: 8 }}>📦</Text>
                      <Text style={{
                        color: '#8E8E93',
                        fontSize: 14,
                        textAlign: 'center',
                      }}>
                        Không tìm thấy DLC cho game này
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}