WARN: no SMS provider is enabled. Disabling phone login
Initialising login role...
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          alt_phone: string | null
          area: string | null
          city: string
          created_at: string | null
          id: string
          is_default: boolean | null
          label: string | null
          line1: string
          line2: string | null
          name: string
          phone: string
          pincode: string
          state: string
          user_id: string
        }
        Insert: {
          alt_phone?: string | null
          area?: string | null
          city: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          line1: string
          line2?: string | null
          name: string
          phone: string
          pincode: string
          state: string
          user_id: string
        }
        Update: {
          alt_phone?: string | null
          area?: string | null
          city?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          line1?: string
          line2?: string | null
          name?: string
          phone?: string
          pincode?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          message: string
          target: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          message: string
          target?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          message?: string
          target?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_holder: string
          account_number: string
          bank_name: string | null
          created_at: string | null
          id: string
          ifsc_code: string
          is_verified: boolean | null
          razorpay_contact_id: string | null
          razorpay_fund_account_id: string | null
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          account_holder: string
          account_number: string
          bank_name?: string | null
          created_at?: string | null
          id?: string
          ifsc_code: string
          is_verified?: boolean | null
          razorpay_contact_id?: string | null
          razorpay_fund_account_id?: string | null
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          account_holder?: string
          account_number?: string
          bank_name?: string | null
          created_at?: string | null
          id?: string
          ifsc_code?: string
          is_verified?: boolean | null
          razorpay_contact_id?: string | null
          razorpay_fund_account_id?: string | null
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          id: string
          message: string
          recipient_count: number | null
          sent_at: string | null
          status: string | null
          store_id: string
        }
        Insert: {
          id?: string
          message: string
          recipient_count?: number | null
          sent_at?: string | null
          status?: string | null
          store_id: string
        }
        Update: {
          id?: string
          message?: string
          recipient_count?: number | null
          sent_at?: string | null
          status?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          selected_variant: Json | null
          store_id: string
          updated_at: string | null
          user_id: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          quantity?: number
          selected_variant?: Json | null
          store_id: string
          updated_at?: string | null
          user_id: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          selected_variant?: Json | null
          store_id?: string
          updated_at?: string | null
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_transactions: {
        Row: {
          coins: number
          created_at: string | null
          id: string
          order_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          coins: number
          created_at?: string | null
          id?: string
          order_id?: string | null
          reason: string
          user_id: string
        }
        Update: {
          coins?: number
          created_at?: string | null
          id?: string
          order_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coin_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coin_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_uses: {
        Row: {
          buyer_id: string
          coupon_id: string
          discount_amount: number | null
          id: string
          order_id: string
          used_at: string | null
        }
        Insert: {
          buyer_id: string
          coupon_id: string
          discount_amount?: number | null
          id?: string
          order_id: string
          used_at?: string | null
        }
        Update: {
          buyer_id?: string
          coupon_id?: string
          discount_amount?: number | null
          id?: string
          order_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_uses_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_uses_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_uses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          max_discount: number | null
          max_uses: number | null
          min_order_amount: number | null
          per_user_limit: number | null
          store_id: string
          total_uses: number | null
          type: string
          valid_from: string | null
          valid_until: string | null
          value: number
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_discount?: number | null
          max_uses?: number | null
          min_order_amount?: number | null
          per_user_limit?: number | null
          store_id: string
          total_uses?: number | null
          type: string
          valid_from?: string | null
          valid_until?: string | null
          value: number
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_discount?: number | null
          max_uses?: number | null
          min_order_amount?: number | null
          per_user_limit?: number | null
          store_id?: string
          total_uses?: number | null
          type?: string
          valid_from?: string | null
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string | null
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      followed_stores: {
        Row: {
          buyer_id: string
          created_at: string | null
          store_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string | null
          store_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followed_stores_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followed_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          auto_accept_orders: boolean | null
          new_order_push: boolean | null
          new_order_whatsapp: boolean | null
          order_update_push: boolean | null
          order_update_whatsapp: boolean | null
          promotions_push: boolean | null
          user_id: string
        }
        Insert: {
          auto_accept_orders?: boolean | null
          new_order_push?: boolean | null
          new_order_whatsapp?: boolean | null
          order_update_push?: boolean | null
          order_update_whatsapp?: boolean | null
          promotions_push?: boolean | null
          user_id: string
        }
        Update: {
          auto_accept_orders?: boolean | null
          new_order_push?: boolean | null
          new_order_whatsapp?: boolean | null
          order_update_push?: boolean | null
          order_update_whatsapp?: boolean | null
          promotions_push?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          awb_code: string | null
          buyer_id: string
          coins_discount: number | null
          coins_redeemed: number | null
          created_at: string | null
          delivered_at: string | null
          delivery_address: Json
          delivery_fee: number | null
          discount_amount: number | null
          id: string
          items: Json
          notification_sent: boolean | null
          order_number: string | null
          payment_method: string | null
          payment_status: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          rejection_reason: string | null
          shipped_at: string | null
          shiprocket_order_id: string | null
          status: string
          store_id: string
          subtotal: number
          total_amount: number
          tracking_url: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          awb_code?: string | null
          buyer_id: string
          coins_discount?: number | null
          coins_redeemed?: number | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_address: Json
          delivery_fee?: number | null
          discount_amount?: number | null
          id?: string
          items?: Json
          notification_sent?: boolean | null
          order_number?: string | null
          payment_method?: string | null
          payment_status?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          rejection_reason?: string | null
          shipped_at?: string | null
          shiprocket_order_id?: string | null
          status?: string
          store_id: string
          subtotal: number
          total_amount: number
          tracking_url?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          awb_code?: string | null
          buyer_id?: string
          coins_discount?: number | null
          coins_redeemed?: number | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_address?: Json
          delivery_fee?: number | null
          discount_amount?: number | null
          id?: string
          items?: Json
          notification_sent?: boolean | null
          order_number?: string | null
          payment_method?: string | null
          payment_status?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          rejection_reason?: string | null
          shipped_at?: string | null
          shiprocket_order_id?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          total_amount?: number
          tracking_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          order_count: number | null
          period_end: string | null
          period_start: string | null
          processed_at: string | null
          razorpay_payout_id: string | null
          seller_id: string
          status: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          order_count?: number | null
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          razorpay_payout_id?: string | null
          seller_id: string
          status?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          order_count?: number | null
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          razorpay_payout_id?: string | null
          seller_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          id: string
          is_available: boolean | null
          name: string
          price_adjustment: number | null
          product_id: string
          sort_order: number | null
          stock_count: number | null
          variant_type: string
        }
        Insert: {
          id?: string
          is_available?: boolean | null
          name: string
          price_adjustment?: number | null
          product_id: string
          sort_order?: number | null
          stock_count?: number | null
          variant_type: string
        }
        Update: {
          id?: string
          is_available?: boolean | null
          name?: string
          price_adjustment?: number | null
          product_id?: string
          sort_order?: number | null
          stock_count?: number | null
          variant_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          compare_price: number | null
          created_at: string | null
          description: string | null
          id: string
          images: string[] | null
          is_available: boolean | null
          low_stock_threshold: number | null
          name: string
          price: number
          search_vector: unknown
          sort_order: number | null
          stock_count: number | null
          stock_type: string | null
          store_id: string
          total_sold: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          compare_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_available?: boolean | null
          low_stock_threshold?: number | null
          name: string
          price: number
          search_vector?: unknown
          sort_order?: number | null
          stock_count?: number | null
          stock_type?: string | null
          store_id: string
          total_sold?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          compare_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_available?: boolean | null
          low_stock_threshold?: number | null
          name?: string
          price?: number
          search_vector?: unknown
          sort_order?: number | null
          stock_count?: number | null
          stock_type?: string | null
          store_id?: string
          total_sold?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_installs: {
        Row: {
          created_at: string | null
          device_fingerprint: string | null
          id: string
          new_user_id: string | null
          store_slug: string | null
        }
        Insert: {
          created_at?: string | null
          device_fingerprint?: string | null
          id?: string
          new_user_id?: string | null
          store_slug?: string | null
        }
        Update: {
          created_at?: string | null
          device_fingerprint?: string | null
          id?: string
          new_user_id?: string | null
          store_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_installs_new_user_id_fkey"
            columns: ["new_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_installs_store_slug_fkey"
            columns: ["store_slug"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_slug"]
          },
        ]
      }
      returns: {
        Row: {
          admin_notes: string | null
          buyer_id: string
          description: string | null
          id: string
          order_id: string
          photos: string[] | null
          razorpay_refund_id: string | null
          reason: string
          refund_amount: number | null
          requested_at: string | null
          resolved_at: string | null
          status: string | null
          store_id: string
        }
        Insert: {
          admin_notes?: string | null
          buyer_id: string
          description?: string | null
          id?: string
          order_id: string
          photos?: string[] | null
          razorpay_refund_id?: string | null
          reason: string
          refund_amount?: number | null
          requested_at?: string | null
          resolved_at?: string | null
          status?: string | null
          store_id: string
        }
        Update: {
          admin_notes?: string | null
          buyer_id?: string
          description?: string | null
          id?: string
          order_id?: string
          photos?: string[] | null
          razorpay_refund_id?: string | null
          reason?: string
          refund_amount?: number | null
          requested_at?: string | null
          resolved_at?: string | null
          status?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          buyer_id: string
          coins_awarded: number | null
          created_at: string | null
          id: string
          is_verified_purchase: boolean | null
          order_id: string
          photos: string[] | null
          product_id: string | null
          rating: number
          review_text: string | null
          seller_replied_at: string | null
          seller_reply: string | null
          store_id: string
        }
        Insert: {
          buyer_id: string
          coins_awarded?: number | null
          created_at?: string | null
          id?: string
          is_verified_purchase?: boolean | null
          order_id: string
          photos?: string[] | null
          product_id?: string | null
          rating: number
          review_text?: string | null
          seller_replied_at?: string | null
          seller_reply?: string | null
          store_id: string
        }
        Update: {
          buyer_id?: string
          coins_awarded?: number | null
          created_at?: string | null
          id?: string
          is_verified_purchase?: boolean | null
          order_id?: string
          photos?: string[] | null
          product_id?: string | null
          rating?: number
          review_text?: string | null
          seller_replied_at?: string | null
          seller_reply?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          aadhaar_url: string | null
          area: string | null
          category: string
          city: string
          close_time: string | null
          created_at: string | null
          description: string | null
          id: string
          instagram_handle: string | null
          is_active: boolean | null
          is_open: boolean | null
          is_verified: boolean | null
          logo_url: string | null
          open_days: string[] | null
          open_time: string | null
          pincode: string | null
          rating_avg: number | null
          referral_installs: number | null
          seller_id: string
          store_name: string
          store_slug: string
          total_orders: number | null
          total_reviews: number | null
          updated_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          aadhaar_url?: string | null
          area?: string | null
          category: string
          city: string
          close_time?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          instagram_handle?: string | null
          is_active?: boolean | null
          is_open?: boolean | null
          is_verified?: boolean | null
          logo_url?: string | null
          open_days?: string[] | null
          open_time?: string | null
          pincode?: string | null
          rating_avg?: number | null
          referral_installs?: number | null
          seller_id: string
          store_name: string
          store_slug: string
          total_orders?: number | null
          total_reviews?: number | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          aadhaar_url?: string | null
          area?: string | null
          category?: string
          city?: string
          close_time?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          instagram_handle?: string | null
          is_active?: boolean | null
          is_open?: boolean | null
          is_verified?: boolean | null
          logo_url?: string | null
          open_days?: string[] | null
          open_time?: string | null
          pincode?: string | null
          rating_avg?: number | null
          referral_installs?: number | null
          seller_id?: string
          store_name?: string
          store_slug?: string
          total_orders?: number | null
          total_reviews?: number | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          is_admin: boolean | null
          loyalty_coins: number
          name: string | null
          phone: string
          referral_code: string | null
          referred_by: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id: string
          is_admin?: boolean | null
          loyalty_coins?: number
          name?: string | null
          phone: string
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          is_admin?: boolean | null
          loyalty_coins?: number
          name?: string | null
          phone?: string
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          created_at: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_loyalty_coins: {
        Args: {
          p_coins: number
          p_order_id?: string
          p_reason: string
          p_user_id: string
        }
        Returns: undefined
      }
      generate_store_slug: { Args: { store_name: string }; Returns: string }
      redeem_loyalty_coins: {
        Args: { p_coins: number; p_order_id: string; p_user_id: string }
        Returns: number
      }
      use_coupon: {
        Args: {
          p_buyer_id: string
          p_coupon_id: string
          p_discount: number
          p_order_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
A new version of Supabase CLI is available: v2.98.2 (currently installed v2.95.4)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
