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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accesos: {
        Row: {
          at: string
          id: number
          ip: string | null
          ok: boolean
          origen: string
          username: string
        }
        Insert: {
          at?: string
          id?: number
          ip?: string | null
          ok: boolean
          origen: string
          username: string
        }
        Update: {
          at?: string
          id?: number
          ip?: string | null
          ok?: boolean
          origen?: string
          username?: string
        }
        Relationships: []
      }
      altas_autorizadas: {
        Row: {
          creada_at: string
          email: string
        }
        Insert: {
          creada_at?: string
          email: string
        }
        Update: {
          creada_at?: string
          email?: string
        }
        Relationships: []
      }
      ausencias: {
        Row: {
          anulada_at: string | null
          anulada_por: string | null
          decidida_at: string | null
          decidida_por: string | null
          desde: string
          estado: string
          hasta: string
          id: string
          motivo: string | null
          motivo_decision: string | null
          solicitada_at: string
          solicitada_por: string
          tipo: string
          user_id: string
        }
        Insert: {
          anulada_at?: string | null
          anulada_por?: string | null
          decidida_at?: string | null
          decidida_por?: string | null
          desde: string
          estado?: string
          hasta: string
          id?: string
          motivo?: string | null
          motivo_decision?: string | null
          solicitada_at?: string
          solicitada_por: string
          tipo: string
          user_id: string
        }
        Update: {
          anulada_at?: string | null
          anulada_por?: string | null
          decidida_at?: string | null
          decidida_por?: string | null
          desde?: string
          estado?: string
          hasta?: string
          id?: string
          motivo?: string | null
          motivo_decision?: string | null
          solicitada_at?: string
          solicitada_por?: string
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      avisos_enviados: {
        Row: {
          clave: string
          enviado_at: string
          user_id: string
        }
        Insert: {
          clave: string
          enviado_at?: string
          user_id: string
        }
        Update: {
          clave?: string
          enviado_at?: string
          user_id?: string
        }
        Relationships: []
      }
      avisos_privacidad: {
        Row: {
          id: string
          user_id: string
          version: string
          visto_at: string
        }
        Insert: {
          id?: string
          user_id: string
          version: string
          visto_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          version?: string
          visto_at?: string
        }
        Relationships: []
      }
      cierres_empresa: {
        Row: {
          desde: string
          hasta: string
          id: string
          nombre: string
          puente: boolean
        }
        Insert: {
          desde: string
          hasta: string
          id?: string
          nombre: string
          puente?: boolean
        }
        Update: {
          desde?: string
          hasta?: string
          id?: string
          nombre?: string
          puente?: boolean
        }
        Relationships: []
      }
      cierres_mes: {
        Row: {
          cerrado_at: string
          comentario: string | null
          conforme: boolean
          mes: string
          user_id: string
        }
        Insert: {
          cerrado_at?: string
          comentario?: string | null
          conforme: boolean
          mes: string
          user_id: string
        }
        Update: {
          cerrado_at?: string
          comentario?: string | null
          conforme?: boolean
          mes?: string
          user_id?: string
        }
        Relationships: []
      }
      config_jornada: {
        Row: {
          compensar_sabados: boolean
          fichaje_activo: boolean
          dias_vacaciones: number
          hora_entrada: string
          hora_salida: string
          horas_anuales: number
          horas_semana: number
          id: number
          ip_kiosco: string[]
          max_ausentes: number
        }
        Insert: {
          compensar_sabados?: boolean
          fichaje_activo?: boolean
          dias_vacaciones?: number
          hora_entrada?: string
          hora_salida?: string
          horas_anuales?: number
          horas_semana?: number
          id?: number
          ip_kiosco?: string[]
          max_ausentes?: number
        }
        Update: {
          compensar_sabados?: boolean
          fichaje_activo?: boolean
          dias_vacaciones?: number
          hora_entrada?: string
          hora_salida?: string
          horas_anuales?: number
          horas_semana?: number
          id?: number
          ip_kiosco?: string[]
          max_ausentes?: number
        }
        Relationships: []
      }
      correcciones: {
        Row: {
          antes: Json
          at: string
          dia: string
          id: string
          motivo: string
          por: string
          user_id: string
        }
        Insert: {
          antes?: Json
          at?: string
          dia: string
          id?: string
          motivo: string
          por: string
          user_id: string
        }
        Update: {
          antes?: Json
          at?: string
          dia?: string
          id?: string
          motivo?: string
          por?: string
          user_id?: string
        }
        Relationships: []
      }
      decisiones_correccion: {
        Row: {
          aprobada: boolean
          decidida_at: string
          decidida_por: string
          id: string
          motivo: string
          solicitud_id: string
        }
        Insert: {
          aprobada: boolean
          decidida_at?: string
          decidida_por: string
          id?: string
          motivo: string
          solicitud_id: string
        }
        Update: {
          aprobada?: boolean
          decidida_at?: string
          decidida_por?: string
          id?: string
          motivo?: string
          solicitud_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisiones_correccion_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: true
            referencedRelation: "solicitudes_correccion"
            referencedColumns: ["id"]
          },
        ]
      }
      festivos: {
        Row: {
          fecha: string
          nombre: string
          provisional: boolean
          tipo: string
        }
        Insert: {
          fecha: string
          nombre: string
          provisional?: boolean
          tipo?: string
        }
        Update: {
          fecha?: string
          nombre?: string
          provisional?: boolean
          tipo?: string
        }
        Relationships: []
      }
      fichajes: {
        Row: {
          at: string
          created_at: string
          dia: string
          editado: boolean
          id: string
          lugar: string
          modalidad: string
          tipo: string
          user_id: string
        }
        Insert: {
          at?: string
          created_at?: string
          dia: string
          editado?: boolean
          id?: string
          lugar?: string
          modalidad?: string
          tipo: string
          user_id: string
        }
        Update: {
          at?: string
          created_at?: string
          dia?: string
          editado?: boolean
          id?: string
          lugar?: string
          modalidad?: string
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      horarios_periodo: {
        Row: {
          desde: string
          dia_semana: number | null
          hasta: string
          hora_entrada: string
          hora_salida: string
          horas_dia: number | null
          id: string
          nombre: string
        }
        Insert: {
          desde: string
          dia_semana?: number | null
          hasta: string
          hora_entrada: string
          hora_salida: string
          horas_dia?: number | null
          id?: string
          nombre: string
        }
        Update: {
          desde?: string
          dia_semana?: number | null
          hasta?: string
          hora_entrada?: string
          hora_salida?: string
          horas_dia?: number | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activo: boolean
          conductor: boolean
          created_at: string
          debe_cambiar_pin: boolean
          id: string
          inspector: boolean
          nombre: string
          username: string
        }
        Insert: {
          activo?: boolean
          conductor?: boolean
          created_at?: string
          debe_cambiar_pin?: boolean
          id: string
          inspector?: boolean
          nombre: string
          username: string
        }
        Update: {
          activo?: boolean
          conductor?: boolean
          created_at?: string
          debe_cambiar_pin?: boolean
          id?: string
          inspector?: boolean
          nombre?: string
          username?: string
        }
        Relationships: []
      }
      push_subs: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      solicitudes_correccion: {
        Row: {
          id: string
          motivo: string
          propuesta: Json
          solicitada_at: string
          solicitada_por: string
          user_id: string
        }
        Insert: {
          id?: string
          motivo: string
          propuesta: Json
          solicitada_at?: string
          solicitada_por: string
          user_id: string
        }
        Update: {
          id?: string
          motivo?: string
          propuesta?: Json
          solicitada_at?: string
          solicitada_por?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vacaciones_ajustes: {
        Row: {
          anio: number
          creado_at: string
          creado_por: string
          dias: number
          id: string
          motivo: string
          user_id: string
        }
        Insert: {
          anio: number
          creado_at?: string
          creado_por: string
          dias: number
          id?: string
          motivo: string
          user_id: string
        }
        Update: {
          anio?: number
          creado_at?: string
          creado_por?: string
          dias?: number
          id?: string
          motivo?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activar_fichaje: { Args: { _activo: boolean }; Returns: undefined }
      cargar_calendario: { Args: { _datos: Json }; Returns: Json }
      cerrar_mes: {
        Args: { _comentario: string; _conforme: boolean; _mes: string }
        Returns: undefined
      }
      cupo_vacaciones: { Args: { _uid: string; _year: number }; Returns: number }
      decide_correction: {
        Args: { _aprobar: boolean; _id: string; _motivo: string }
        Returns: undefined
      }
      decidir_ausencia: {
        Args: { _estado: string; _id: string; _motivo: string }
        Returns: undefined
      }
      dias_compensados: { Args: { _year: number }; Returns: number }
      edit_employee: {
        Args: {
          _activo: boolean
          _id: string
          _nombre: string
          _username: string
        }
        Returns: undefined
      }
      effective_punches:
        | {
            Args: { _uid: string }
            Returns: {
              at: string
              dia: string
              editado: boolean
              id: string
              lugar: string
              modalidad: string
              original_at: string
              original_id: string
              tipo: string
              user_id: string
            }[]
          }
        | {
            Args: { _desde: string; _uid: string }
            Returns: {
              at: string
              dia: string
              editado: boolean
              id: string
              lugar: string
              modalidad: string
              original_at: string
              original_id: string
              tipo: string
              user_id: string
            }[]
          }
      es_inspector: { Args: { _uid: string }; Returns: boolean }
      estado_tras: { Args: { _tipo: string }; Returns: string }
      guardar_ajuste_vacaciones: {
        Args: { _anio: number; _borrar: boolean; _dias: number; _id: string; _motivo: string; _uid: string }
        Returns: string
      }
      guardar_cierre_empresa: {
        Args: {
          _borrar: boolean
          _desde: string
          _hasta: string
          _id: string
          _nombre: string
          _puente?: boolean
        }
        Returns: string
      }
      guardar_config:
        | {
            Args: {
              _entrada: string
              _horas_anuales: number
              _horas_semana: number
              _ips: string[]
              _salida: string
              _vacaciones: number
            }
            Returns: undefined
          }
        | {
            Args: {
              _entrada: string
              _horas_anuales: number
              _horas_semana: number
              _ips: string[]
              _compensar_sabados?: boolean
              _max_ausentes: number
              _salida: string
              _vacaciones: number
            }
            Returns: undefined
          }
      guardar_festivo: {
        Args: {
          _borrar: boolean
          _fecha: string
          _fecha_anterior?: string
          _nombre: string
          _provisional?: boolean
          _tipo?: string
        }
        Returns: undefined
      }
      guardar_horario_periodo: {
        Args: {
          _borrar: boolean
          _desde: string
          _dia_semana: number
          _entrada: string
          _hasta: string
          _horas: number
          _id: string
          _nombre: string
          _salida: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      intento_login: {
        Args: { _ip: string; _origen: string; _username: string }
        Returns: number
      }
      intento_ok: { Args: { _id: number }; Returns: undefined }
      is_active: { Args: { _uid: string }; Returns: boolean }
      is_inspector: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      laborables_vacaciones: {
        Args: { _desde: string; _hasta: string }
        Returns: number
      }
      list_punches: {
        Args: { _desde?: string; _uid?: string }
        Returns: Json[]
      }
      marcar_conductor: {
        Args: { _conductor: boolean; _id: string }
        Returns: undefined
      }
      marcar_inspector: {
        Args: { _id: string; _inspector: boolean }
        Returns: undefined
      }
      paso_valido: { Args: { _st: string; _tipo: string }; Returns: boolean }
      request_correction: {
        Args: { _motivo: string; _propuesta: Json; _uid: string }
        Returns: string
      }
      solicitar_ausencia: {
        Args: {
          _desde: string
          _hasta: string
          _motivo: string
          _tipo: string
          _uid: string
        }
        Returns: string
      }
      vacaciones_usadas: {
        Args: { _uid: string; _year: number }
        Returns: number
      }
      validate_punch_sequence: { Args: { _uid: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
